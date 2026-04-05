import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prisma = {
    institute: {
      findFirst: jest.fn(),
    },
    feature: {
      findMany: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
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

  const auditLog = {
    record: jest.fn(),
  };

  const emailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendStudentOnboardingEmail: jest.fn(),
  };

  const userProvisioningService = {
    validateAdminSignup: jest.fn(),
    createLocalAdminProvisioning: jest.fn(),
    provisionAdminSupabaseUser: jest.fn(),
    provisionAdminInstituteFeatures: jest.fn(),
    sendAdminVerificationEmail: jest.fn(),
    provisionInvitedUser: jest.fn(),
  };

  const legacyAuthService = {
    login: jest.fn(),
    refresh: jest.fn(),
    changePassword: jest.fn(),
  };

  const supabaseAuthService = {
    signIn: jest.fn(),
    refreshSession: jest.fn(),
  };

  const userAuthMigrationService = {
    migrateUserAfterLegacyLogin: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'DUAL_AUTH_ENABLED') return 'false';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_ENABLED') return 'false';
      return undefined;
    });
    service = new AuthService(
      prisma as any,
      jwtService as any,
      configService as any,
      auditLog as any,
      emailService as any,
      userProvisioningService as any,
      legacyAuthService as any,
      supabaseAuthService as any,
      userAuthMigrationService as any,
    );
  });

  describe('login', () => {
    it('keeps custom user login behavior unchanged while adding authProvider', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'custom',
        isActive: true,
        isDeleted: false,
        mustChangePassword: true,
        name: 'Admin User',
        email: 'admin@example.com',
        role: { name: 'admin' },
      });
      legacyAuthService.login.mockResolvedValue({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        user: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          instituteId: 'institute-1',
          mustChangePassword: true,
        },
      });

      const result = await service.login({
        emailOrPhone: 'admin@example.com',
        password: 'Password123',
      });

      expect(legacyAuthService.login).toHaveBeenCalledWith({
        emailOrPhone: 'admin@example.com',
        password: 'Password123',
      });
      expect(supabaseAuthService.signIn).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        authProvider: 'custom',
        user: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          instituteId: 'institute-1',
          mustChangePassword: true,
        },
      });
      expect(userAuthMigrationService.migrateUserAfterLegacyLogin).not.toHaveBeenCalled();
    });

    it('triggers login migration for custom users when enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'false';
        if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'custom',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Admin User',
        email: 'admin@example.com',
        supabaseAuthId: null,
        role: { name: 'admin' },
      });
      legacyAuthService.login.mockResolvedValue({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        user: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          instituteId: 'institute-1',
          mustChangePassword: false,
        },
      });
      userAuthMigrationService.migrateUserAfterLegacyLogin.mockResolvedValue({
        status: 'completed',
        supabaseAuthId: 'auth-user-1',
        manualReconciliationRequired: false,
      });

      const result = await service.login({
        emailOrPhone: 'admin@example.com',
        password: 'Password123',
      });

      expect(result.authProvider).toBe('custom');
      await new Promise((resolve) => setImmediate(resolve));
      expect(userAuthMigrationService.migrateUserAfterLegacyLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          email: 'admin@example.com',
          instituteId: 'institute-1',
          authProvider: 'custom',
          supabaseAuthId: null,
        }),
        'Password123',
      );
      expect(auditLog.record).toHaveBeenCalledWith({
        instituteId: 'institute-1',
        userId: 'user-1',
        action: 'USER_AUTH_MIGRATION_ATTEMPTED',
        targetId: 'user-1',
        targetType: 'user',
        newValues: {
          authProvider: 'custom',
          hasSupabaseAuthId: false,
        },
      });
    });

    it('skips login-triggered migration when disabled', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'custom',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Admin User',
        email: 'admin@example.com',
        supabaseAuthId: null,
        role: { name: 'admin' },
      });
      legacyAuthService.login.mockResolvedValue({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        user: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          instituteId: 'institute-1',
          mustChangePassword: false,
        },
      });

      await service.login({
        emailOrPhone: 'admin@example.com',
        password: 'Password123',
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(userAuthMigrationService.migrateUserAfterLegacyLogin).not.toHaveBeenCalled();
    });

    it('does not block legacy login when migration fails', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'false';
        if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'custom',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Admin User',
        email: 'admin@example.com',
        supabaseAuthId: null,
        role: { name: 'admin' },
      });
      legacyAuthService.login.mockResolvedValue({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        user: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          instituteId: 'institute-1',
          mustChangePassword: false,
        },
      });
      userAuthMigrationService.migrateUserAfterLegacyLogin.mockRejectedValue(
        new Error('migration failed'),
      );

      const result = await service.login({
        emailOrPhone: 'admin@example.com',
        password: 'Password123',
      });

      expect(result).toEqual({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        authProvider: 'custom',
        user: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          instituteId: 'institute-1',
          mustChangePassword: false,
        },
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(userAuthMigrationService.migrateUserAfterLegacyLogin).toHaveBeenCalled();
    });

    it('logs in Supabase users through SupabaseAuthService', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });
      supabaseAuthService.signIn.mockResolvedValue({
        accessToken: 'supabase-access-token',
        refreshToken: 'supabase-refresh-token',
        identity: {
          sub: 'user-1',
          email: 'teacher@example.com',
          institute_id: 'institute-1',
          role: 'teacher',
          auth_provider: 'supabase',
          session_id: 'session-1',
        },
      });
      prisma.user.update.mockResolvedValue(undefined);

      const result = await service.login({
        emailOrPhone: 'teacher@example.com',
        password: 'Password123',
      });

      expect(supabaseAuthService.signIn).toHaveBeenCalledWith(
        'teacher@example.com',
        'Password123',
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          sessionId: 'session-1',
          lastLoginAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        accessToken: 'supabase-access-token',
        refreshToken: 'supabase-refresh-token',
        authProvider: 'supabase',
        user: {
          id: 'user-1',
          name: 'Teacher User',
          email: 'teacher@example.com',
          role: 'teacher',
          instituteId: 'institute-1',
          mustChangePassword: false,
        },
      });
    });

    it('fails Supabase login with wrong password', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });
      supabaseAuthService.signIn.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        service.login({
          emailOrPhone: 'teacher@example.com',
          password: 'bad-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects Supabase login when dual auth is disabled', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });

      await expect(
        service.login({
          emailOrPhone: 'teacher@example.com',
          password: 'Password123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(supabaseAuthService.signIn).not.toHaveBeenCalled();
    });

    it('rejects provider mismatches returned by Supabase sign-in', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });
      supabaseAuthService.signIn.mockResolvedValue({
        accessToken: 'supabase-access-token',
        refreshToken: 'supabase-refresh-token',
        identity: {
          sub: 'user-1',
          email: 'teacher@example.com',
          institute_id: 'institute-2',
          role: 'teacher',
          auth_provider: 'supabase',
          session_id: 'session-1',
        },
      });

      await expect(
        service.login({
          emailOrPhone: 'teacher@example.com',
          password: 'Password123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects inactive Supabase users before sign-in', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        isActive: false,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });

      await expect(
        service.login({
          emailOrPhone: 'teacher@example.com',
          password: 'Password123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(supabaseAuthService.signIn).not.toHaveBeenCalled();
    });
  });

  describe('signup', () => {
    it('runs fast admin signup validation before local provisioning begins', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
        return undefined;
      });
      userProvisioningService.validateAdminSignup.mockResolvedValue(undefined);
      prisma.institute.findFirst.mockResolvedValue(null);
      prisma.feature.findMany.mockResolvedValue([{ id: 1, name: 'students' }]);
      prisma.role.findFirst.mockResolvedValue({ id: 1, name: 'admin' });
      userProvisioningService.createLocalAdminProvisioning.mockResolvedValue({
        instituteId: 'institute-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          instituteId: 'institute-1',
          email: 'admin@example.com',
          name: 'Admin',
        },
      });
      userProvisioningService.sendAdminVerificationEmail.mockResolvedValue(true);
      userProvisioningService.provisionAdminInstituteFeatures.mockResolvedValue(undefined);
      userProvisioningService.provisionAdminSupabaseUser.mockResolvedValue(undefined);

      await service.signup({
        name: 'Admin',
        instituteName: 'Teachly',
        email: 'Admin@Example.com',
        phone: '1234567890',
        password: 'Password123',
        features: ['students'],
      });

      expect(userProvisioningService.validateAdminSignup).toHaveBeenCalledWith('admin@example.com');
      expect(userProvisioningService.validateAdminSignup.mock.invocationCallOrder[0]).toBeLessThan(
        userProvisioningService.createLocalAdminProvisioning.mock.invocationCallOrder[0],
      );
    });

    it('triggers background Supabase provisioning after successful local provisioning', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
        return undefined;
      });
      userProvisioningService.validateAdminSignup.mockResolvedValue(undefined);
      prisma.institute.findFirst.mockResolvedValue(null);
      prisma.feature.findMany.mockResolvedValue([{ id: 1, name: 'students' }]);
      prisma.role.findFirst.mockResolvedValue({ id: 1, name: 'admin' });
      userProvisioningService.createLocalAdminProvisioning.mockResolvedValue({
        instituteId: 'institute-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          instituteId: 'institute-1',
          email: 'admin@example.com',
          name: 'Admin',
        },
      });
      userProvisioningService.sendAdminVerificationEmail.mockResolvedValue(true);
      userProvisioningService.provisionAdminInstituteFeatures.mockResolvedValue(undefined);
      userProvisioningService.provisionAdminSupabaseUser.mockResolvedValue(undefined);

      const result = await service.signup({
        name: 'Admin',
        instituteName: 'Teachly',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'Password123',
        features: ['students'],
      });

      expect(userProvisioningService.createLocalAdminProvisioning).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedEmail: 'admin@example.com',
          authProvider: 'custom',
          authMigrationStatus: 'pending',
        }),
      );
      expect(userProvisioningService.provisionAdminSupabaseUser).toHaveBeenCalledWith({
        userId: 'user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        plaintextPassword: 'Password123',
      });
      expect(userProvisioningService.provisionAdminInstituteFeatures).toHaveBeenCalledWith({
        userId: 'user-1',
        instituteId: 'institute-1',
        featureIds: [1],
      });
      expect(userProvisioningService.sendAdminVerificationEmail).toHaveBeenCalledWith({
        userId: 'user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        name: 'Admin',
        rawToken: expect.any(String),
      });
      expect(result).toEqual({
        message: 'Account created. Please verify your email to continue.',
      });
    });

    it('does not wait for background email sending', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
        return undefined;
      });
      userProvisioningService.validateAdminSignup.mockResolvedValue(undefined);
      prisma.institute.findFirst.mockResolvedValue(null);
      prisma.feature.findMany.mockResolvedValue([{ id: 1, name: 'students' }]);
      prisma.role.findFirst.mockResolvedValue({ id: 1, name: 'admin' });
      userProvisioningService.createLocalAdminProvisioning.mockResolvedValue({
        instituteId: 'institute-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          instituteId: 'institute-1',
          email: 'admin@example.com',
          name: 'Admin',
        },
      });
      userProvisioningService.sendAdminVerificationEmail.mockImplementation(
        () => new Promise(() => undefined),
      );
      userProvisioningService.provisionAdminInstituteFeatures.mockResolvedValue(undefined);
      userProvisioningService.provisionAdminSupabaseUser.mockResolvedValue(undefined);

      const result = await service.signup({
        name: 'Admin',
        instituteName: 'Teachly',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'Password123',
        features: ['students'],
      });

      expect(result).toEqual({
        message: 'Account created. Please verify your email to continue.',
      });
      expect(userProvisioningService.sendAdminVerificationEmail).toHaveBeenCalled();
    });

    it('does not wait for background feature provisioning', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
        return undefined;
      });
      userProvisioningService.validateAdminSignup.mockResolvedValue(undefined);
      prisma.institute.findFirst.mockResolvedValue(null);
      prisma.feature.findMany.mockResolvedValue([{ id: 1, name: 'students' }]);
      prisma.role.findFirst.mockResolvedValue({ id: 1, name: 'admin' });
      userProvisioningService.createLocalAdminProvisioning.mockResolvedValue({
        instituteId: 'institute-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          instituteId: 'institute-1',
          email: 'admin@example.com',
          name: 'Admin',
        },
      });
      userProvisioningService.sendAdminVerificationEmail.mockResolvedValue(true);
      userProvisioningService.provisionAdminInstituteFeatures.mockImplementation(
        () => new Promise(() => undefined),
      );
      userProvisioningService.provisionAdminSupabaseUser.mockResolvedValue(undefined);

      const result = await service.signup({
        name: 'Admin',
        instituteName: 'Teachly',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'Password123',
        features: ['students'],
      });

      expect(result).toEqual({
        message: 'Account created. Please verify your email to continue.',
      });
      expect(userProvisioningService.provisionAdminInstituteFeatures).toHaveBeenCalledWith({
        userId: 'user-1',
        instituteId: 'institute-1',
        featureIds: [1],
      });
    });

    it('does not block signup when background tasks fail', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
        return undefined;
      });
      userProvisioningService.validateAdminSignup.mockResolvedValue(undefined);
      prisma.institute.findFirst.mockResolvedValue(null);
      prisma.feature.findMany.mockResolvedValue([{ id: 1, name: 'students' }]);
      prisma.role.findFirst.mockResolvedValue({ id: 1, name: 'admin' });
      userProvisioningService.createLocalAdminProvisioning.mockResolvedValue({
        instituteId: 'institute-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          instituteId: 'institute-1',
          email: 'admin@example.com',
          name: 'Admin',
        },
      });
      userProvisioningService.sendAdminVerificationEmail.mockRejectedValue(new Error('smtp failed'));
      userProvisioningService.provisionAdminInstituteFeatures.mockRejectedValue(
        new Error('feature failed'),
      );
      userProvisioningService.provisionAdminSupabaseUser.mockRejectedValue(
        new Error('supabase create failed'),
      );
      auditLog.record.mockRejectedValue(new Error('audit failed'));

      const result = await service.signup({
        name: 'Admin',
        instituteName: 'Teachly',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'Password123',
        features: ['students'],
      });

      expect(result).toEqual({
        message: 'Account created. Please verify your email to continue.',
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(userProvisioningService.sendAdminVerificationEmail).toHaveBeenCalled();
      expect(userProvisioningService.provisionAdminInstituteFeatures).toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith({
        instituteId: 'institute-1',
        userId: 'user-1',
        action: 'SIGNUP',
        targetId: 'user-1',
        targetType: 'user',
      });
    });
  });

  describe('resetPassword', () => {
    it('clears mustChangePassword and invalidates sessions after a valid reset', async () => {
      const token = 'plain-reset-token';
      const newPassword = 'NewStrongPass123';
      const passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        passwordResetExpiresAt,
        isDeleted: false,
      });
      prisma.user.update.mockResolvedValue(undefined);
      auditLog.record.mockResolvedValue(undefined);

      const result = await service.resetPassword({
        token,
        newPassword,
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          passwordResetToken: expect.any(String),
          isDeleted: false,
        },
      });

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(updateArgs.data).toEqual(
        expect.objectContaining({
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          mustChangePassword: false,
          sessionId: null,
          refreshTokenHash: null,
          passwordHash: expect.any(String),
        }),
      );
      await expect(
        bcrypt.compare(newPassword, updateArgs.data.passwordHash),
      ).resolves.toBe(true);

      expect(auditLog.record).toHaveBeenCalledWith({
        instituteId: 'institute-1',
        userId: 'user-1',
        action: 'PASSWORD_RESET',
        targetId: 'user-1',
        targetType: 'user',
      });
      expect(result).toEqual({
        message: 'Password reset successfully. Please log in with your new password.',
      });
    });

    it('rejects expired reset links', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        passwordResetExpiresAt: new Date(Date.now() - 60_000),
        isDeleted: false,
      });

      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'NewStrongPass123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    it('does not send the legacy verification email for Supabase users', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin',
        authProvider: 'supabase',
        isEmailVerified: false,
        isDeleted: false,
      });

      const result = await service.resendVerification({
        email: 'admin@example.com',
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: 'If your email is registered and unverified, a new link has been sent.',
      });
    });
  });

  describe('refresh', () => {
    const makeLegacyRefreshToken = (payload: Record<string, unknown>) => {
      const encode = (value: Record<string, unknown>) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
    };

    it('keeps custom refresh behavior unchanged', async () => {
      prisma.user.findUnique.mockResolvedValue({
        authProvider: 'custom',
      });
      legacyAuthService.refresh.mockResolvedValue({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
      });

      const result = await service.refresh({
        refreshToken: makeLegacyRefreshToken({
          sub: 'user-1',
          session_id: 'session-1',
          type: 'refresh',
        }),
      });

      expect(legacyAuthService.refresh).toHaveBeenCalledWith({
        refreshToken: expect.any(String),
      });
      expect(supabaseAuthService.refreshSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
      });
    });

    it('refreshes Supabase sessions when dual auth is enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      supabaseAuthService.refreshSession.mockResolvedValue({
        accessToken: 'supabase-access-token',
        refreshToken: 'supabase-refresh-token',
        identity: {
          sub: 'user-1',
          email: 'teacher@example.com',
          institute_id: 'institute-1',
          role: 'teacher',
          auth_provider: 'supabase',
          session_id: 'session-1',
        },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        sessionId: 'session-1',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });
      prisma.user.update.mockResolvedValue(undefined);

      const result = await service.refresh({
        refreshToken: 'supabase-refresh-token',
      });

      expect(supabaseAuthService.refreshSession).toHaveBeenCalledWith('supabase-refresh-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          sessionId: 'session-1',
          lastLoginAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        accessToken: 'supabase-access-token',
        refreshToken: 'supabase-refresh-token',
        authProvider: 'supabase',
        user: {
          id: 'user-1',
          name: 'Teacher User',
          email: 'teacher@example.com',
          role: 'teacher',
          instituteId: 'institute-1',
          mustChangePassword: false,
        },
      });
    });

    it('rejects provider mismatches during refresh', async () => {
      prisma.user.findUnique.mockResolvedValue({
        authProvider: 'supabase',
      });

      await expect(
        service.refresh({
          refreshToken: makeLegacyRefreshToken({
            sub: 'user-1',
            session_id: 'session-1',
            type: 'refresh',
          }),
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(legacyAuthService.refresh).not.toHaveBeenCalled();
    });

    it('rejects session mismatches during Supabase refresh', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      supabaseAuthService.refreshSession.mockResolvedValue({
        accessToken: 'supabase-access-token',
        refreshToken: 'supabase-refresh-token',
        identity: {
          sub: 'user-1',
          email: 'teacher@example.com',
          institute_id: 'institute-1',
          role: 'teacher',
          auth_provider: 'supabase',
          session_id: 'session-1',
        },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        instituteId: 'institute-1',
        authProvider: 'supabase',
        sessionId: 'session-2',
        isActive: true,
        isDeleted: false,
        mustChangePassword: false,
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { name: 'teacher' },
      });

      await expect(
        service.refresh({
          refreshToken: 'supabase-refresh-token',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'SESSION_INVALIDATED',
        },
      });
    });
  });

  describe('logout', () => {
    it('clears session state for Supabase users', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DUAL_AUTH_ENABLED') return 'true';
        return undefined;
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        authProvider: 'supabase',
      });
      prisma.user.update.mockResolvedValue(undefined);

      const result = await service.logout('user-1', 'institute-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { sessionId: null, refreshTokenHash: null },
      });
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
