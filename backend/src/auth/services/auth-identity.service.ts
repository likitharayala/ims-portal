import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthenticatedRequestUser,
  AuthProviderType,
} from '../interfaces/authenticated-request-user.interface';
import { SupabaseTokenClaims } from '../interfaces/supabase-token-claims.interface';
import { LegacyAuthService } from './legacy-auth.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service';
import { AuthConfigService } from './auth-config.service';

@Injectable()
export class AuthIdentityService {
  private readonly logger = new Logger(AuthIdentityService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly legacyAuthService: LegacyAuthService,
    private readonly supabaseAuthService: SupabaseAuthService,
    private readonly supabaseTokenVerifierService: SupabaseTokenVerifierService,
    private readonly authConfig: AuthConfigService,
  ) {}

  async authenticateBearerToken(token: string): Promise<AuthenticatedRequestUser> {
    if (!this.authConfig.isDualAuthEnabled()) {
      return this.legacyAuthService.verifyAccessToken(token);
    }

    const provider = this.detectProvider(token);
    this.logger.debug(`Detected ${provider} bearer token in AuthIdentityService`);

    const verifiedIdentity =
      provider === 'supabase'
        ? this.normalizeSupabaseClaims(
            await this.supabaseTokenVerifierService.verifyAccessToken(token),
          )
        : await this.legacyAuthService.verifyAccessToken(token);

    return this.resolveAuthenticatedUser(verifiedIdentity, provider);
  }

  async authenticateLogin(
    _identifier: string,
    _password: string,
  ): Promise<AuthenticatedRequestUser> {
    void this.legacyAuthService;
    void this.supabaseAuthService;
    void this.supabaseTokenVerifierService;
    void this.authConfig.isDualAuthEnabled();
    return {
      sub: 'placeholder-user-id',
      email: 'placeholder@example.com',
      institute_id: 'placeholder-institute-id',
      role: 'admin',
      auth_provider: 'custom',
      session_id: 'placeholder-session-id',
    };
  }

  private async resolveAuthenticatedUser(
    verifiedIdentity: AuthenticatedRequestUser,
    detectedProvider: AuthProviderType,
  ): Promise<AuthenticatedRequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: verifiedIdentity.sub },
      select: {
        id: true,
        email: true,
        instituteId: true,
        authProvider: true,
        sessionId: true,
        isActive: true,
        isDeleted: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user || user.isDeleted || !user.isActive) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found or inactive',
      });
    }

    if (user.authProvider !== detectedProvider) {
      throw new UnauthorizedException({
        code: 'AUTH_PROVIDER_MISMATCH',
        message: 'Authentication provider does not match user configuration',
      });
    }

    if (user.sessionId !== verifiedIdentity.session_id) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALIDATED',
        message: 'Session expired. Please log in again.',
      });
    }

    return {
      sub: user.id,
      email: user.email,
      institute_id: user.instituteId,
      role: user.role.name,
      auth_provider: detectedProvider,
      session_id: verifiedIdentity.session_id,
    };
  }

  private detectProvider(token: string): AuthProviderType {
    const payload = this.parsePayload(token);
    return payload.iss === this.getSupabaseIssuer() ? 'supabase' : 'custom';
  }

  private normalizeSupabaseClaims(claims: SupabaseTokenClaims): AuthenticatedRequestUser {
    return {
      sub: claims.sub,
      email: claims.email,
      institute_id: '',
      role: '',
      auth_provider: 'supabase',
      session_id: claims.session_id,
    };
  }

  private parsePayload(token: string): { iss?: string } {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    try {
      const payload = Buffer.from(this.toBase64(parts[1]), 'base64').toString('utf8');
      return JSON.parse(payload) as { iss?: string };
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }
  }

  private toBase64(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    return `${base64}${padding}`;
  }

  private getSupabaseIssuer(): string {
    return `${this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/+$/, '')}/auth/v1`;
  }
}
