import { UserAuthMigrationService } from './user-auth-migration.service';

describe('UserAuthMigrationService', () => {
  let service: UserAuthMigrationService;

  const prisma = {
    user: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const auditLog = {
    record: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  const supabaseAdmin = {
    findUserByEmail: jest.fn(),
    createUser: jest.fn(),
    deleteUser: jest.fn(),
  };

  const baseUser = {
    id: 'user-1',
    email: 'User@example.com',
    name: 'Legacy User',
    instituteId: 'institute-1',
    authProvider: 'custom' as const,
    supabaseAuthId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.count.mockResolvedValue(0);
    config.get.mockImplementation((key: string) => {
      if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_DRY_RUN') return 'false';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_MAX_PER_MINUTE') return '0';
      return undefined;
    });
    service = new UserAuthMigrationService(
      prisma as any,
      auditLog as any,
      config as any,
      supabaseAdmin as any,
    );
  });

  it('migrates a custom user successfully after legacy login', async () => {
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);
    supabaseAdmin.createUser.mockResolvedValue({
      id: 'auth-user-1',
      email: 'user@example.com',
    });
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(supabaseAdmin.createUser).toHaveBeenCalledWith('user@example.com', {
      password: 'Password123',
      emailConfirm: true,
      userMetadata: {
        migratedFrom: 'custom',
        localUserId: 'user-1',
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        authProvider: 'supabase',
        supabaseAuthId: 'auth-user-1',
        authMigrationStatus: 'completed',
        authMigratedAt: expect.any(Date),
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith({
      instituteId: 'institute-1',
      userId: 'user-1',
      action: 'USER_AUTH_MIGRATION_STARTED',
      targetId: 'user-1',
      targetType: 'user',
      newValues: {
        authProvider: 'custom',
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith({
      instituteId: 'institute-1',
      userId: 'user-1',
      action: 'USER_AUTH_MIGRATION_COMPLETED',
      targetId: 'user-1',
      targetType: 'user',
      newValues: {
        supabaseAuthId: 'auth-user-1',
      },
    });
    expect(result).toEqual({
      status: 'completed',
      supabaseAuthId: 'auth-user-1',
      manualReconciliationRequired: false,
    });
  });

  it('returns failure without changing the local user when Supabase creation fails', async () => {
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);
    supabaseAdmin.createUser.mockRejectedValue(new Error('supabase failed'));

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(supabaseAdmin.deleteUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'failed',
      supabaseAuthId: null,
      manualReconciliationRequired: false,
      reason: 'supabase_create_failed',
    });
  });

  it('attempts Supabase rollback when the local DB update fails', async () => {
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);
    supabaseAdmin.createUser.mockResolvedValue({
      id: 'auth-user-1',
      email: 'user@example.com',
    });
    prisma.user.update.mockRejectedValueOnce(new Error('db failed'));
    supabaseAdmin.deleteUser.mockResolvedValue({ success: true });

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('auth-user-1');
    expect(result).toEqual({
      status: 'failed',
      supabaseAuthId: null,
      manualReconciliationRequired: false,
      reason: 'database_update_failed',
    });
  });

  it('marks migration as failed when DB update and rollback both fail', async () => {
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);
    supabaseAdmin.createUser.mockResolvedValue({
      id: 'auth-user-1',
      email: 'user@example.com',
    });
    prisma.user.update
      .mockRejectedValueOnce(new Error('db failed'))
      .mockResolvedValueOnce(undefined);
    supabaseAdmin.deleteUser.mockRejectedValue(new Error('delete failed'));

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: {
        authMigrationStatus: 'failed',
      },
    });
    expect(result).toEqual({
      status: 'failed',
      supabaseAuthId: null,
      manualReconciliationRequired: true,
      reason: 'database_update_failed',
    });
  });

  it('returns success immediately for an already linked user', async () => {
    const result = await service.migrateUserAfterLegacyLogin(
      {
        ...baseUser,
        supabaseAuthId: 'auth-user-1',
      },
      'Password123',
    );

    expect(supabaseAdmin.createUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'completed',
      supabaseAuthId: 'auth-user-1',
      manualReconciliationRequired: false,
      reason: 'already_migrated',
    });
  });

  it('skips non-custom users safely', async () => {
    const result = await service.migrateUserAfterLegacyLogin(
      {
        ...baseUser,
        authProvider: 'supabase',
        supabaseAuthId: 'auth-user-1',
      },
      'Password123',
    );

    expect(supabaseAdmin.createUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      supabaseAuthId: 'auth-user-1',
      manualReconciliationRequired: false,
      reason: 'not_custom',
    });
  });

  it('links an existing Supabase user safely without creating a duplicate', async () => {
    supabaseAdmin.findUserByEmail.mockResolvedValue({
      id: 'auth-user-1',
      email: 'user@example.com',
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(supabaseAdmin.createUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        authProvider: 'supabase',
        supabaseAuthId: 'auth-user-1',
        authMigrationStatus: 'completed',
        authMigratedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      status: 'completed',
      supabaseAuthId: 'auth-user-1',
      manualReconciliationRequired: false,
    });
  });

  it('fails safely when an existing Supabase user is already linked elsewhere', async () => {
    supabaseAdmin.findUserByEmail.mockResolvedValue({
      id: 'auth-user-9',
      email: 'user@example.com',
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-9',
    });
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(supabaseAdmin.createUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        authMigrationStatus: 'failed',
      },
    });
    expect(result).toEqual({
      status: 'failed',
      supabaseAuthId: null,
      manualReconciliationRequired: true,
      reason: 'supabase_email_conflict',
    });
  });

  it('returns migration stats counts', async () => {
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const result = await service.getMigrationStats();

    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: {
        isDeleted: false,
      },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
      where: {
        authProvider: 'custom',
        isDeleted: false,
      },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(3, {
      where: {
        authProvider: 'supabase',
        isDeleted: false,
      },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(4, {
      where: {
        authMigrationStatus: 'completed',
        isDeleted: false,
      },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(5, {
      where: {
        authMigrationStatus: 'failed',
        isDeleted: false,
      },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(6, {
      where: {
        authMigrationStatus: 'pending',
        isDeleted: false,
      },
    });
    expect(result).toEqual({
      totalUsers: 10,
      customUsers: 6,
      supabaseUsers: 4,
      migratedUsers: 3,
      failedMigrations: 1,
      pendingMigrations: 2,
    });
  });

  it('supports dry-run mode without executing migration', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_DRY_RUN') return 'true';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_MAX_PER_MINUTE') return '0';
      return undefined;
    });

    const result = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');

    expect(supabaseAdmin.findUserByEmail).not.toHaveBeenCalled();
    expect(supabaseAdmin.createUser).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      supabaseAuthId: null,
      manualReconciliationRequired: false,
      reason: 'dry_run',
    });
  });

  it('can report migration readiness when safe to enable', async () => {
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);

    const result = await service.getMigrationReadiness();

    expect(result).toEqual({
      safeToEnable: true,
      riskFactors: [],
      recommendedNextStep: 'Safe to enable login-triggered migration for a small pilot cohort.',
    });
  });

  it('reports migration readiness risks when dry-run and failures exist', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_DRY_RUN') return 'true';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_MAX_PER_MINUTE') return '0';
      return undefined;
    });
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);

    const result = await service.getMigrationReadiness();

    expect(result.safeToEnable).toBe(false);
    expect(result.riskFactors).toContain('Login-triggered auth migration is in dry-run mode');
    expect(result.riskFactors).toContain('There are 2 failed migrations to review');
    expect(result.recommendedNextStep).toBe(
      'Review and retry failed migrations before enabling migration.',
    );
  });

  it('reports unsafe readiness when Supabase connectivity fails', async () => {
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    supabaseAdmin.findUserByEmail.mockRejectedValue(new Error('network failed'));

    const result = await service.getMigrationReadiness();

    expect(result.safeToEnable).toBe(false);
    expect(result.riskFactors).toContain('Supabase connectivity check failed');
    expect(result.recommendedNextStep).toBe(
      'Fix Supabase connectivity before enabling migration.',
    );
  });

  it('rate limits migrations when the per-minute guard is reached', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'SUPABASE_PROVISIONING_ENABLED') return 'true';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_DRY_RUN') return 'false';
      if (key === 'LOGIN_TRIGGERED_AUTH_MIGRATION_MAX_PER_MINUTE') return '1';
      return undefined;
    });
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);
    supabaseAdmin.createUser.mockResolvedValue({
      id: 'auth-user-1',
      email: 'user@example.com',
    });
    prisma.user.update.mockResolvedValue(undefined);

    const firstAttempt = await service.migrateUserAfterLegacyLogin(baseUser, 'Password123');
    const secondAttempt = await service.migrateUserAfterLegacyLogin(
      {
        ...baseUser,
        id: 'user-2',
        email: 'second@example.com',
      },
      'Password456',
    );

    expect(firstAttempt.status).toBe('completed');
    expect(secondAttempt).toEqual({
      status: 'skipped',
      supabaseAuthId: null,
      manualReconciliationRequired: false,
      reason: 'rate_limited',
    });
  });

  it('retries a failed migration by linking an existing Supabase user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'User@example.com',
      name: 'Legacy User',
      instituteId: 'institute-1',
      authProvider: 'custom',
      supabaseAuthId: null,
      authMigrationStatus: 'failed',
      isDeleted: false,
    });
    supabaseAdmin.findUserByEmail.mockResolvedValue({
      id: 'auth-user-1',
      email: 'user@example.com',
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.retryFailedMigration('user-1');

    expect(supabaseAdmin.createUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        authProvider: 'supabase',
        supabaseAuthId: 'auth-user-1',
        authMigrationStatus: 'completed',
        authMigratedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      status: 'completed',
      supabaseAuthId: 'auth-user-1',
      manualReconciliationRequired: false,
    });
  });

  it('returns a safe failure when retry cannot proceed without an existing Supabase user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'User@example.com',
      name: 'Legacy User',
      instituteId: 'institute-1',
      authProvider: 'custom',
      supabaseAuthId: null,
      authMigrationStatus: 'failed',
      isDeleted: false,
    });
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);

    const result = await service.retryFailedMigration('user-1');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'failed',
      supabaseAuthId: null,
      manualReconciliationRequired: false,
      reason: 'retry_requires_password',
    });
  });

  it('returns true from isMigrationSafeToEnable when readiness is healthy', async () => {
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);

    await expect(service.isMigrationSafeToEnable()).resolves.toBe(true);
  });
});
