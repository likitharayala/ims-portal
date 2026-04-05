import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { webcrypto } from 'crypto';
import { SupabaseTokenClaims } from '../interfaces/supabase-token-claims.interface';

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JsonWebKeySetResponse {
  keys?: SupabaseJsonWebKey[];
}

interface CachedJwks {
  expiresAt: number;
  keys: Map<string, SupabaseJsonWebKey>;
}

type SupabaseJsonWebKey = JsonWebKey & { kid?: string };

const DEFAULT_JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SupabaseTokenVerifierService {
  private cachedJwks: CachedJwks | null = null;

  constructor(private readonly config: ConfigService) {}

  async verifyAccessToken(token: string): Promise<SupabaseTokenClaims> {
    const { header, payload, signingInput, signature } = this.parseJwt(token);

    this.validateClaims(payload);

    if (this.isSupportedLocalVerification(header.alg, header.kid)) {
      try {
        const verificationResult = await this.verifyWithJwks(header, signingInput, signature);
        if (verificationResult === true) {
          return payload;
        }

        if (verificationResult === false) {
          throw new UnauthorizedException('Invalid Supabase token signature');
        }
      } catch (error) {
        if (
          error instanceof UnauthorizedException &&
          error.message === 'Invalid Supabase token signature'
        ) {
          throw error;
        }
      }
    }

    await this.verifyViaAuthServer(token);
    return payload;
  }

  private parseJwt(token: string): {
    header: JwtHeader;
    payload: SupabaseTokenClaims;
    signingInput: string;
    signature: Uint8Array;
  } {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed Supabase token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = this.decodeBase64UrlJson<JwtHeader>(
      encodedHeader,
      'Invalid Supabase token header',
    );
    const payload = this.decodeBase64UrlJson<SupabaseTokenClaims>(
      encodedPayload,
      'Invalid Supabase token payload',
    );

    return {
      header,
      payload,
      signingInput: `${encodedHeader}.${encodedPayload}`,
      signature: this.decodeBase64UrlBytes(encodedSignature),
    };
  }

  private validateClaims(payload: SupabaseTokenClaims): void {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expectedIssuer = this.getExpectedIssuer();
    const expectedAudience = this.config.get<string>('SUPABASE_JWT_AUDIENCE');

    if (!payload.sub || !payload.email || !payload.session_id) {
      throw new UnauthorizedException('Supabase token is missing required claims');
    }

    if (!payload.iss || payload.iss !== expectedIssuer) {
      throw new UnauthorizedException('Supabase token issuer is invalid');
    }

    if (!payload.exp || payload.exp <= nowInSeconds) {
      throw new UnauthorizedException('Supabase token has expired');
    }

    if (expectedAudience && !this.matchesAudience(payload.aud, expectedAudience)) {
      throw new UnauthorizedException('Supabase token audience is invalid');
    }
  }

  private async verifyWithJwks(
    header: JwtHeader,
    signingInput: string,
    signature: Uint8Array,
  ): Promise<boolean | null> {
    const jwk = await this.getSigningKey(header.kid as string);
    if (!jwk) {
      return null;
    }

    if (!header.alg || !this.isSupportedAlgorithm(header.alg)) {
      return null;
    }

    const cryptoKey = await webcrypto.subtle.importKey(
      'jwk',
      jwk,
      this.getImportAlgorithm(header.alg),
      false,
      ['verify'],
    );

    return webcrypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      cryptoKey,
      signature,
      new TextEncoder().encode(signingInput),
    );
  }

  private async getSigningKey(kid: string): Promise<SupabaseJsonWebKey | null> {
    const jwks = await this.getCachedJwks();
    return jwks.get(kid) ?? null;
  }

  private async getCachedJwks(): Promise<Map<string, SupabaseJsonWebKey>> {
    const now = Date.now();
    if (this.cachedJwks && this.cachedJwks.expiresAt > now) {
      return this.cachedJwks.keys;
    }

    const response = await fetch(`${this.getExpectedIssuer()}/.well-known/jwks.json`);
    if (!response.ok) {
      throw new UnauthorizedException('Unable to fetch Supabase JWKS');
    }

    const payload = (await response.json()) as JsonWebKeySetResponse;
    const keys = new Map<string, SupabaseJsonWebKey>();

    for (const key of payload.keys ?? []) {
      if (key.kid) {
        keys.set(key.kid, key);
      }
    }

    this.cachedJwks = {
      expiresAt: now + DEFAULT_JWKS_CACHE_TTL_MS,
      keys,
    };

    return keys;
  }

  private async verifyViaAuthServer(token: string): Promise<void> {
    const response = await fetch(`${this.getExpectedIssuer()}/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Supabase token verification failed');
    }
  }

  private decodeBase64UrlJson<T>(value: string, errorMessage: string): T {
    try {
      const decoded = Buffer.from(this.toBase64(value), 'base64').toString('utf8');
      return JSON.parse(decoded) as T;
    } catch {
      throw new UnauthorizedException(errorMessage);
    }
  }

  private decodeBase64UrlBytes(value: string): Uint8Array {
    try {
      return Uint8Array.from(Buffer.from(this.toBase64(value), 'base64'));
    } catch {
      throw new UnauthorizedException('Malformed Supabase token signature');
    }
  }

  private toBase64(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    return `${base64}${padding}`;
  }

  private matchesAudience(audience: string | string[] | undefined, expected: string): boolean {
    if (!audience) {
      return false;
    }

    return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
  }

  private getExpectedIssuer(): string {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/+$/, '');
    return `${supabaseUrl}/auth/v1`;
  }

  private isSupportedLocalVerification(alg: string | undefined, kid: string | undefined): boolean {
    return Boolean(alg && kid && this.isSupportedAlgorithm(alg));
  }

  private isSupportedAlgorithm(alg: string): boolean {
    return ['RS256', 'RS384', 'RS512'].includes(alg);
  }

  private getImportAlgorithm(alg: string): RsaHashedImportParams {
    return {
      name: 'RSASSA-PKCS1-v1_5',
      hash: this.getHashAlgorithm(alg),
    };
  }

  private getHashAlgorithm(alg: string): 'SHA-256' | 'SHA-384' | 'SHA-512' {
    if (alg === 'RS384') return 'SHA-384';
    if (alg === 'RS512') return 'SHA-512';
    return 'SHA-256';
  }
}
