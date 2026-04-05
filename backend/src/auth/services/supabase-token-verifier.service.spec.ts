import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service';

describe('SupabaseTokenVerifierService', () => {
  const issuer = 'https://project-ref.supabase.co/auth/v1';
  const serviceRoleKey = 'service-role-key';
  let service: SupabaseTokenVerifierService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'SUPABASE_JWT_AUDIENCE') {
          return 'authenticated';
        }
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'SUPABASE_URL') {
          return 'https://project-ref.supabase.co';
        }
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
          return serviceRoleKey;
        }
        throw new Error(`Unexpected key ${key}`);
      }),
    };

    service = new SupabaseTokenVerifierService(configService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies a valid RS256 Supabase token using JWKS', async () => {
    const { privateKey, publicJwk } = createKeyMaterial('key-1');
    const token = createJwt(privateKey, {
      sub: 'user-1',
      email: 'student@example.com',
      session_id: 'session-1',
      iss: issuer,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keys: [publicJwk] }),
    });

    const result = await service.verifyAccessToken(token);

    expect(result).toEqual(
      expect.objectContaining({
        sub: 'user-1',
        email: 'student@example.com',
        session_id: 'session-1',
        iss: issuer,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a token with an invalid signature', async () => {
    const { privateKey: signingKey } = createKeyMaterial('key-1');
    const { publicJwk } = createKeyMaterial('key-1');
    const token = createJwt(signingKey, {
      sub: 'user-1',
      email: 'student@example.com',
      session_id: 'session-1',
      iss: issuer,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keys: [publicJwk] }),
    });

    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const { privateKey } = createKeyMaterial('key-1');
    const token = createJwt(privateKey, {
      sub: 'user-1',
      email: 'student@example.com',
      session_id: 'session-1',
      iss: issuer,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a token with the wrong issuer', async () => {
    const { privateKey } = createKeyMaterial('key-1');
    const token = createJwt(privateKey, {
      sub: 'user-1',
      email: 'student@example.com',
      session_id: 'session-1',
      iss: 'https://wrong-issuer.example.com/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });

    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed token', async () => {
    await expect(service.verifyAccessToken('not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function createKeyMaterial(kid: string) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
    publicJwk.kid = kid;
    publicJwk.use = 'sig';
    publicJwk.alg = 'RS256';

    return { privateKey, publicJwk };
  }

  function createJwt(
    privateKey: crypto.KeyObject,
    payload: Record<string, unknown>,
    header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'key-1' },
  ) {
    const encodedHeader = encodeBase64Url(JSON.stringify(header));
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createSign('RSA-SHA256').update(signingInput).end().sign(privateKey);
    return `${signingInput}.${encodeBase64Url(signature)}`;
  }

  function encodeBase64Url(value: string | Buffer): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
});
