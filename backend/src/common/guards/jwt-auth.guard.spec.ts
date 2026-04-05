import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from '../decorators/allow-during-password-change.decorator';
import { AuthIdentityService } from '../../auth/services/auth-identity.service';
import { AuthConfigService } from '../../auth/services/auth-config.service';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const authIdentityService = {
    authenticateBearerToken: jest.fn(),
  };

  const authConfig = {
    isDualAuthEnabled: jest.fn(),
  };

  const request = {
    headers: {
      authorization: 'Bearer legacy-token',
    },
    user: {
      sub: 'user-1',
      session_id: 'session-1',
      institute_id: 'institute-1',
      role: 'student',
    },
  };

  const createExecutionContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    authConfig.isDualAuthEnabled.mockReturnValue(false);
    authIdentityService.authenticateBearerToken.mockResolvedValue({
      sub: 'user-1',
      email: '',
      institute_id: 'institute-1',
      role: 'student',
      auth_provider: 'custom',
      session_id: 'session-1',
    });
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      prisma as any,
      authIdentityService as unknown as AuthIdentityService,
      authConfig as unknown as AuthConfigService,
    );

    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true as never);
  });

  it('blocks protected routes when a password change is required', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ALLOW_DURING_PASSWORD_CHANGE_KEY) return false;
      return undefined;
    });
    prisma.user.findUnique.mockResolvedValue({
      sessionId: 'session-1',
      isDeleted: false,
      isActive: true,
      mustChangePassword: true,
    });

    await expect(guard.canActivate(createExecutionContext())).rejects.toMatchObject({
      response: {
        code: 'PASSWORD_CHANGE_REQUIRED',
      },
    } satisfies Partial<ForbiddenException>);
  });

  it('allows explicitly whitelisted routes during forced password change', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ALLOW_DURING_PASSWORD_CHANGE_KEY) return true;
      return undefined;
    });
    prisma.user.findUnique.mockResolvedValue({
      sessionId: 'session-1',
      isDeleted: false,
      isActive: true,
      mustChangePassword: true,
    });

    await expect(guard.canActivate(createExecutionContext())).resolves.toBe(true);
  });

  it('skips auth checks for public routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );

    await expect(guard.canActivate(createExecutionContext())).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the legacy passport path when dual auth is disabled', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ALLOW_DURING_PASSWORD_CHANGE_KEY) return false;
      return undefined;
    });
    prisma.user.findUnique.mockResolvedValue({
      sessionId: 'session-1',
      isDeleted: false,
      isActive: true,
      mustChangePassword: false,
    });

    await expect(guard.canActivate(createExecutionContext())).resolves.toBe(true);
    expect(authIdentityService.authenticateBearerToken).not.toHaveBeenCalled();
  });

  it('uses AuthIdentityService when dual auth is enabled', async () => {
    authConfig.isDualAuthEnabled.mockReturnValue(true);
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ALLOW_DURING_PASSWORD_CHANGE_KEY) return false;
      return undefined;
    });
    prisma.user.findUnique.mockResolvedValue({
      sessionId: 'session-1',
      isDeleted: false,
      isActive: true,
      mustChangePassword: false,
    });

    await expect(guard.canActivate(createExecutionContext())).resolves.toBe(true);
    expect(authIdentityService.authenticateBearerToken).toHaveBeenCalledWith('legacy-token');
  });

  it('rejects non-legacy tokens when dual auth is disabled', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ALLOW_DURING_PASSWORD_CHANGE_KEY) return false;
      return undefined;
    });

    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockRejectedValueOnce({
        response: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      } as never);

    await expect(guard.canActivate(createExecutionContext())).rejects.toMatchObject({
      response: {
        code: 'UNAUTHORIZED',
      },
    });
    expect(authIdentityService.authenticateBearerToken).not.toHaveBeenCalled();
  });
});
