import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import { AuthIdentityService } from './auth-identity.service';
import { LegacyAuthService } from './legacy-auth.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service';

describe('AuthIdentityService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const legacyAuthService = {
    verifyAccessToken: jest.fn(),
  };

  const supabaseAuthService = {
  };

  const supabaseTokenVerifierService = {
    verifyAccessToken: jest.fn(),
  };

  const authConfig = {
    isDualAuthEnabled: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('https://project-ref.supabase.co'),
  };

  const createModule = async () =>
    Test.createTestingModule({
      providers: [
        AuthIdentityService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: LegacyAuthService,
          useValue: legacyAuthService,
        },
        {
          provide: SupabaseAuthService,
          useValue: supabaseAuthService,
        },
        {
          provide: SupabaseTokenVerifierService,
          useValue: supabaseTokenVerifierService,
        },
        {
          provide: AuthConfigService,
          useValue: authConfig,
        },
      ],
    }).compile();

  beforeEach(() => {
    jest.clearAllMocks();
    authConfig.isDualAuthEnabled.mockReturnValue(false);
    configService.getOrThrow.mockReturnValue('https://project-ref.supabase.co');
  });

  it('loads successfully', async () => {
    const moduleRef = await createModule();

    const service = moduleRef.get(AuthIdentityService);

    expect(service).toBeDefined();
  });

  it('uses legacy verification when dual auth is disabled', async () => {
    legacyAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'admin',
      auth_provider: 'custom',
      session_id: 'session-1',
    });

    const moduleRef = await createModule();

    const service = moduleRef.get(AuthIdentityService);

    await expect(service.authenticateBearerToken('legacy-token')).resolves.toEqual({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'admin',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    expect(legacyAuthService.verifyAccessToken).toHaveBeenCalledWith('legacy-token');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a legacy token when dual auth is enabled', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    legacyAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: '',
      institute_id: 'legacy-institute',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      instituteId: 'institute-1',
      authProvider: 'custom',
      sessionId: 'session-1',
      isActive: true,
      isDeleted: false,
      role: { name: 'student' },
    });

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature',
      ),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'student@example.com',
      institute_id: 'institute-1',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    expect(legacyAuthService.verifyAccessToken).toHaveBeenCalled();
    expect(supabaseTokenVerifierService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('accepts a Supabase token when dual auth is enabled', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    supabaseTokenVerifierService.verifyAccessToken.mockResolvedValue({
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
    });

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL3Byb2plY3QtcmVmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIiwiZW1haWwiOiJ0ZWFjaGVyQGV4YW1wbGUuY29tIn0.signature',
      ),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'teacher@example.com',
      institute_id: 'institute-1',
      role: 'teacher',
      auth_provider: 'supabase',
      session_id: 'session-1',
    });
    expect(supabaseTokenVerifierService.verifyAccessToken).toHaveBeenCalled();
    expect(legacyAuthService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a Supabase token when dual auth is disabled', async () => {
    legacyAuthService.verifyAccessToken.mockRejectedValue(
      new UnauthorizedException('Invalid or expired access token'),
    );

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL3Byb2plY3QtcmVmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIiwiZW1haWwiOiJ0ZWFjaGVyQGV4YW1wbGUuY29tIn0.signature',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(legacyAuthService.verifyAccessToken).toHaveBeenCalled();
    expect(supabaseTokenVerifierService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects provider mismatches using the local user as authority', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    supabaseTokenVerifierService.verifyAccessToken.mockResolvedValue({
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
      authProvider: 'custom',
      sessionId: 'session-1',
      isActive: true,
      isDeleted: false,
      role: { name: 'teacher' },
    });

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL3Byb2plY3QtcmVmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIiwiZW1haWwiOiJ0ZWFjaGVyQGV4YW1wbGUuY29tIn0.signature',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'AUTH_PROVIDER_MISMATCH',
      },
    });
  });

  it('rejects legacy tokens for users configured for Supabase auth', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    legacyAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      instituteId: 'institute-1',
      authProvider: 'supabase',
      sessionId: 'session-1',
      isActive: true,
      isDeleted: false,
      role: { name: 'student' },
    });

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'AUTH_PROVIDER_MISMATCH',
      },
    });
  });

  it('rejects inactive users after verification', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    legacyAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      instituteId: 'institute-1',
      authProvider: 'custom',
      sessionId: 'session-1',
      isActive: false,
      isDeleted: false,
      role: { name: 'student' },
    });

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'USER_NOT_FOUND',
      },
    });
  });

  it('rejects session mismatches after verification', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    legacyAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      instituteId: 'institute-1',
      authProvider: 'custom',
      sessionId: 'session-2',
      isActive: true,
      isDeleted: false,
      role: { name: 'student' },
    });

    const moduleRef = await createModule();
    const service = moduleRef.get(AuthIdentityService);

    await expect(
      service.authenticateBearerToken(
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEiLCJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'SESSION_INVALIDATED',
      },
    });
  });
});
