import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LegacyAuthService } from './legacy-auth.service';

describe('LegacyAuthService', () => {
  let service: LegacyAuthService;

  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return 'jwt-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      if (key === 'JWT_ACCESS_EXPIRY') return '15m';
      if (key === 'JWT_REFRESH_EXPIRY') return '7d';
      return undefined;
    });
    jwtService.sign.mockImplementation((_payload: unknown, options?: { secret?: string }) =>
      options?.secret === 'refresh-secret' ? 'refresh-token' : 'access-token',
    );

    service = new LegacyAuthService(
      prisma as any,
      jwtService as any,
      configService as any,
    );
  });

  it('logs in a legacy user and returns the existing response structure', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('Password123', 4),
      mustChangePassword: true,
      isActive: true,
      isEmailVerified: true,
      role: { name: 'admin' },
    });
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.login({
      emailOrPhone: 'admin@example.com',
      password: 'Password123',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        sessionId: expect.any(String),
        refreshTokenHash: expect.any(String),
        lastLoginAt: expect.any(Date),
      }),
    });
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'user-1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        instituteId: 'institute-1',
        mustChangePassword: true,
      },
    });
  });

  it('refreshes legacy tokens without changing behavior', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      session_id: 'session-1',
      type: 'refresh',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      sessionId: 'session-1',
      refreshTokenHash: crypto
        .createHash('sha256')
        .update('old-refresh-token')
        .digest('hex'),
      isDeleted: false,
      isActive: true,
      role: { name: 'admin' },
    });
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.refresh({
      refreshToken: 'old-refresh-token',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        sessionId: expect.any(String),
        refreshTokenHash: expect.any(String),
      }),
    });
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('rejects invalid legacy credentials', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login({
        emailOrPhone: 'missing@example.com',
        password: 'Password123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies legacy access tokens into a normalized identity', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      institute_id: 'institute-1',
      role: 'admin',
      session_id: 'session-1',
    });

    await expect(service.verifyAccessToken('access-token')).resolves.toEqual({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'admin',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    expect(jwtService.verify).toHaveBeenCalledWith('access-token', {
      secret: 'jwt-secret',
    });
  });
});
