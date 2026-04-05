import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthService } from './supabase-auth.service';

describe('SupabaseAuthService', () => {
  let service: SupabaseAuthService;
  let fetchMock: jest.Mock;

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const supabaseTokenVerifier = {
    verifyAccessToken: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    configService.get.mockReturnValue(undefined);

    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'SUPABASE_URL') {
        return 'https://project-ref.supabase.co';
      }
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
        return 'service-role-key';
      }
      throw new Error(`Unexpected config key ${key}`);
    });

    service = new SupabaseAuthService(
      prisma as any,
      configService as any,
      supabaseTokenVerifier as any,
    );
  });

  it('signs in with Supabase and returns a normalized identity', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    });
    supabaseTokenVerifier.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: 'teacher@example.com',
      session_id: 'session-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'teacher@example.com',
      instituteId: 'institute-1',
      authProvider: 'supabase',
      sessionId: null,
      isActive: true,
      isDeleted: false,
      role: { name: 'teacher' },
      institute: { id: 'institute-1', isActive: true },
    });

    const result = await service.signIn('Teacher@Example.com', 'Password123');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-role-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(supabaseTokenVerifier.verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      identity: {
        sub: 'user-1',
        email: 'teacher@example.com',
        institute_id: 'institute-1',
        role: 'teacher',
        auth_provider: 'supabase',
        session_id: 'session-1',
      },
    });
  });

  it('rejects invalid Supabase credentials', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Invalid login credentials' }),
    });

    await expect(service.signIn('user@example.com', 'bad-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(supabaseTokenVerifier.verifyAccessToken).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects Supabase users that do not exist locally', async () => {
    supabaseTokenVerifier.verifyAccessToken.mockResolvedValue({
      sub: 'missing-user',
      email: 'missing@example.com',
      session_id: 'session-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.validateSupabaseToken('access-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects authProvider mismatches', async () => {
    supabaseTokenVerifier.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: 'admin@example.com',
      session_id: 'session-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      instituteId: 'institute-1',
      authProvider: 'custom',
      sessionId: null,
      isActive: true,
      isDeleted: false,
      role: { name: 'admin' },
      institute: { id: 'institute-1', isActive: true },
    });

    await expect(service.validateSupabaseToken('access-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects inactive local users', async () => {
    supabaseTokenVerifier.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: 'student@example.com',
      session_id: 'session-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      instituteId: 'institute-1',
      authProvider: 'supabase',
      sessionId: null,
      isActive: false,
      isDeleted: false,
      role: { name: 'student' },
      institute: { id: 'institute-1', isActive: true },
    });

    await expect(service.validateSupabaseToken('access-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refreshes Supabase tokens and returns a normalized identity', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      }),
    });
    supabaseTokenVerifier.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: 'teacher@example.com',
      session_id: 'session-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'teacher@example.com',
      instituteId: 'institute-1',
      authProvider: 'supabase',
      sessionId: 'session-1',
      isActive: true,
      isDeleted: false,
      role: { name: 'teacher' },
      institute: { id: 'institute-1', isActive: true },
    });

    const result = await service.refreshSession('refresh-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/token?grant_type=refresh_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'service-role-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(supabaseTokenVerifier.verifyAccessToken).toHaveBeenCalledWith('new-access-token');
    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      identity: {
        sub: 'user-1',
        email: 'teacher@example.com',
        institute_id: 'institute-1',
        role: 'teacher',
        auth_provider: 'supabase',
        session_id: 'session-1',
      },
    });
  });
});
