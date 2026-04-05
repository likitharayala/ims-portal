import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserProvisioningService } from './user-provisioning.service';

describe('UserProvisioningService', () => {
  let service: UserProvisioningService;
  const originalFetch = global.fetch;

  const prisma = {
    institute: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    instituteFeature: {
      createMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const supabaseAdmin = {
    inviteUserByEmail: jest.fn(),
    findUserByEmail: jest.fn(),
    createUser: jest.fn(),
    deleteUser: jest.fn(),
  };

  const emailService = {
    sendVerificationEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    global.fetch = jest.fn() as unknown as typeof fetch;
    service = new UserProvisioningService(prisma as any, emailService as any, supabaseAdmin as any);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const setupTransactionalState = (options?: {
    failOnUserCreate?: boolean;
    failOnFeatureCreate?: boolean;
  }) => {
    const state = {
      institutes: [] as Array<Record<string, unknown>>,
      users: [] as Array<Record<string, unknown>>,
      instituteFeatures: [] as Array<Record<string, unknown>>,
    };

    prisma.$transaction.mockImplementation(async (callback: any) => {
      const stagedState = {
        institutes: [...state.institutes],
        users: [...state.users],
        instituteFeatures: [...state.instituteFeatures],
      };

      const tx = {
        institute: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const institute = {
              id: `institute-${stagedState.institutes.length + 1}`,
              ...data,
            };
            stagedState.institutes.push(institute);
            return institute;
          }),
        },
        user: {
          create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            if (options?.failOnUserCreate) {
              throw new Error('user create failed');
            }

            const user = {
              id: (data.id as string) ?? `user-${stagedState.users.length + 1}`,
              ...data,
            };
            stagedState.users.push(user);
            return user;
          }),
        },
        instituteFeature: {
          createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
            if (options?.failOnFeatureCreate) {
              throw new Error('feature create failed');
            }

            stagedState.instituteFeatures.push(...data);
            return { count: data.length };
          }),
        },
      };

      const result = await callback(tx);
      state.institutes = stagedState.institutes;
      state.users = stagedState.users;
      state.instituteFeatures = stagedState.instituteFeatures;
      return result;
    });

    return state;
  };

  it('rejects admin signup when an institute already exists for the email', async () => {
    prisma.institute.findFirst.mockResolvedValue({ id: 'institute-1' });
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.validateAdminSignup(' Admin@Example.com ')).rejects.toThrow(
      new ConflictException('Institute already exists'),
    );
  });

  it('rejects admin signup when a user already exists for the email', async () => {
    prisma.institute.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

    await expect(service.validateAdminSignup(' Admin@Example.com ')).rejects.toThrow(
      new ConflictException('User already exists'),
    );
  });

  it('allows admin signup validation for a new email', async () => {
    prisma.institute.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.validateAdminSignup(' Admin@Example.com ')).resolves.toBeUndefined();

    expect(prisma.institute.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'admin@example.com',
      },
      select: { id: true },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'admin@example.com',
        isDeleted: false,
      },
      select: { id: true },
    });
  });

  it('does not let a soft-deleted user block admin signup validation', async () => {
    prisma.institute.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.validateAdminSignup(' Admin@Example.com ')).resolves.toBeUndefined();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'admin@example.com',
        isDeleted: false,
      },
      select: { id: true },
    });
  });

  it('rolls back local admin provisioning when user creation fails', async () => {
    const state = setupTransactionalState({ failOnUserCreate: true });

    await expect(
      service.createLocalAdminProvisioning({
        instituteName: 'Teachly',
        normalizedEmail: 'admin@example.com',
        phone: '1234567890',
        slug: 'teachly',
        adminRoleId: 1,
        adminName: 'Admin User',
        passwordHash: 'hashed-password',
        isEmailVerified: false,
        authProvider: 'custom',
        authMigratedAt: null,
        emailVerificationToken: 'verification-token',
        emailVerificationExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
        featureIds: [1, 2],
      }),
    ).rejects.toThrow('user create failed');

    expect(state.institutes).toHaveLength(0);
    expect(state.users).toHaveLength(0);
    expect(state.instituteFeatures).toHaveLength(0);
  });

  it('creates institute and user atomically for admin provisioning', async () => {
    const state = setupTransactionalState();

    const result = await service.createLocalAdminProvisioning({
      instituteName: 'Teachly',
      normalizedEmail: 'admin@example.com',
      phone: '1234567890',
      slug: 'teachly',
      adminRoleId: 1,
      adminName: 'Admin User',
      passwordHash: 'hashed-password',
      isEmailVerified: false,
      authProvider: 'supabase',
      authMigratedAt: null,
      authUserId: 'auth-user-1',
      featureIds: [1, 2],
    });

    expect(state.institutes).toHaveLength(1);
    expect(state.users).toHaveLength(1);
    expect(state.instituteFeatures).toHaveLength(0);
    expect(result).toEqual({
      instituteId: 'institute-1',
      userId: 'auth-user-1',
      user: expect.objectContaining({
        id: 'auth-user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        pendingFeatureIds: [1, 2],
      }),
    });
  });

  it('provisions institute features in the background without blocking local provisioning', async () => {
    prisma.instituteFeature.createMany.mockResolvedValue({ count: 2 });

    await expect(
      service.provisionAdminInstituteFeatures({
        userId: 'user-1',
        instituteId: 'institute-1',
        featureIds: [1, 2],
      }),
    ).resolves.toBe(true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        pendingFeatureIds: [],
      },
    });
    expect(prisma.instituteFeature.createMany).toHaveBeenCalledWith({
      data: [
        {
          instituteId: 'institute-1',
          featureId: 1,
          isEnabled: true,
        },
        {
          instituteId: 'institute-1',
          featureId: 2,
          isEnabled: true,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('swallows feature provisioning failures so signup can be retried later', async () => {
    prisma.instituteFeature.createMany.mockRejectedValue(new Error('feature create failed'));

    await expect(
      service.provisionAdminInstituteFeatures({
        userId: 'user-1',
        instituteId: 'institute-1',
        featureIds: [1, 2],
      }),
    ).resolves.toBe(false);
  });

  it('updates provisioning status when background Supabase provisioning succeeds', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      email: 'admin@example.com',
      supabaseAuthId: null,
      isDeleted: false,
    });
    supabaseAdmin.findUserByEmail.mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        user: {
          id: 'auth-user-1',
          email: 'admin@example.com',
        },
      }),
    });
    prisma.user.update.mockResolvedValue(undefined);

    await expect(
      service.provisionAdminSupabaseUser({
        userId: 'user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        plaintextPassword: 'Password123',
      }),
    ).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/signup',
      {
        method: 'POST',
        headers: {
          apikey: 'service-role-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'Password123',
          options: {
            emailRedirectTo: '/auth/callback',
            data: {
              source: 'admin_signup_background',
              localUserId: 'user-1',
              instituteId: 'institute-1',
            },
          },
        }),
      },
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        supabaseAuthId: 'auth-user-1',
        authMigrationStatus: 'completed',
        authMigratedAt: expect.any(Date),
        lastMigrationError: null,
      },
    });
  });

  it('marks provisioning as failed when background Supabase provisioning fails', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      email: 'admin@example.com',
      supabaseAuthId: null,
      isDeleted: false,
    });
    supabaseAdmin.findUserByEmail.mockRejectedValue(new Error('supabase unavailable'));
    prisma.user.update.mockResolvedValue(undefined);

    await expect(
      service.provisionAdminSupabaseUser({
        userId: 'user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        plaintextPassword: 'Password123',
      }),
    ).resolves.toBe(false);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        authMigrationStatus: 'failed',
        lastMigrationError: 'supabase_provisioning_failed:supabase unavailable',
        migrationRetryCount: {
          increment: 1,
        },
        lastMigrationAttempt: expect.any(Date),
      },
    });
  });

  it('links an existing Supabase user safely during background provisioning', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      email: 'admin@example.com',
      supabaseAuthId: null,
      isDeleted: false,
    });
    supabaseAdmin.findUserByEmail.mockResolvedValue({
      id: 'auth-user-1',
      email: 'admin@example.com',
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(undefined);

    await service.provisionAdminSupabaseUser({
      userId: 'user-1',
      instituteId: 'institute-1',
      email: 'admin@example.com',
      plaintextPassword: 'Password123',
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        supabaseAuthId: 'auth-user-1',
        authMigrationStatus: 'completed',
        authMigratedAt: expect.any(Date),
        lastMigrationError: null,
      },
    });
  });

  it('retries failed Supabase provisioning safely', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        name: 'Admin',
        isDeleted: false,
        isEmailVerified: true,
        supabaseAuthId: null,
        authMigrationStatus: 'failed',
        pendingFeatureIds: [],
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        instituteId: 'institute-1',
        email: 'admin@example.com',
        supabaseAuthId: null,
        isDeleted: false,
      });
    supabaseAdmin.findUserByEmail.mockResolvedValue({
      id: 'auth-user-1',
      email: 'admin@example.com',
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.retryFailedProvisioning('user-1');

    expect(result).toEqual({
      supabaseRetried: true,
      featureRetried: false,
      emailRetried: false,
      completed: true,
    });
  });

  it('retries failed feature provisioning safely', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      email: 'admin@example.com',
      name: 'Admin',
      isDeleted: false,
      isEmailVerified: true,
      supabaseAuthId: 'auth-user-1',
      authMigrationStatus: 'completed',
      pendingFeatureIds: [1, 2],
    });
    prisma.instituteFeature.createMany.mockResolvedValue({ count: 2 });
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.retryFailedProvisioning('user-1');

    expect(result).toEqual({
      supabaseRetried: false,
      featureRetried: true,
      emailRetried: false,
      completed: true,
    });
    expect(prisma.instituteFeature.createMany).toHaveBeenCalled();
  });

  it('retries failed email provisioning safely', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      email: 'admin@example.com',
      name: 'Admin',
      isDeleted: false,
      isEmailVerified: false,
      supabaseAuthId: 'auth-user-1',
      authMigrationStatus: 'completed',
      pendingFeatureIds: [],
    });
    prisma.user.update.mockResolvedValue(undefined);
    emailService.sendVerificationEmail.mockResolvedValue(undefined);

    const result = await service.retryFailedProvisioning('user-1');

    expect(result).toEqual({
      supabaseRetried: false,
      featureRetried: false,
      emailRetried: true,
      completed: true,
    });
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      'admin@example.com',
      'Admin',
      expect.any(String),
    );
  });

  it('returns provisioning stats for observability', async () => {
    prisma.user.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2);
    prisma.user.aggregate.mockResolvedValue({
      _sum: {
        migrationRetryCount: 5,
      },
    });

    await expect(service.getProvisioningStats()).resolves.toEqual({
      totalUsers: 12,
      pendingProvisioning: 3,
      completedProvisioning: 7,
      failedProvisioning: 2,
      retryCount: 5,
      successRate: 77.78,
    });
  });

  it('auto-retries failed provisioning up to the requested limit', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
    const retrySpy = jest
      .spyOn(service, 'retryFailedProvisioning')
      .mockResolvedValueOnce({
        supabaseRetried: true,
        featureRetried: false,
        emailRetried: false,
        completed: true,
      })
      .mockResolvedValueOnce({
        supabaseRetried: false,
        featureRetried: true,
        emailRetried: false,
        completed: false,
      });

    await expect(service.retryAllFailedProvisioning(2)).resolves.toEqual({
      attempted: 2,
      completed: 1,
      failed: 1,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        migrationRetryCount: {
          lt: 5,
        },
        AND: [
          {
            OR: [{ authMigrationStatus: 'failed' }, { lastMigrationError: { not: null } }],
          },
          {
            OR: [
              { lastMigrationAttempt: null },
              { lastMigrationAttempt: { lte: expect.any(Date) } },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: [{ lastMigrationAttempt: 'asc' }, { createdAt: 'asc' }],
      take: 2,
    });
    expect(retrySpy).toHaveBeenCalledTimes(2);
    expect(retrySpy).toHaveBeenNthCalledWith(1, 'user-1');
    expect(retrySpy).toHaveBeenNthCalledWith(2, 'user-2');
  });

  it('skips auto-retry when users exceed the retry cap or cooldown window', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    const retrySpy = jest.spyOn(service, 'retryFailedProvisioning');

    await expect(service.retryAllFailedProvisioning(5)).resolves.toEqual({
      attempted: 0,
      completed: 0,
      failed: 0,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        migrationRetryCount: {
          lt: 5,
        },
        AND: [
          {
            OR: [{ authMigrationStatus: 'failed' }, { lastMigrationError: { not: null } }],
          },
          {
            OR: [
              { lastMigrationAttempt: null },
              { lastMigrationAttempt: { lte: expect.any(Date) } },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: [{ lastMigrationAttempt: 'asc' }, { createdAt: 'asc' }],
      take: 5,
    });
    expect(retrySpy).not.toHaveBeenCalled();
  });

  it('returns an existing local user safely when idempotency is enabled for the same institute', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      instituteId: 'institute-1',
      isDeleted: false,
    });

    const result = await service.provisionInvitedUser({
      action: 'student_provision',
      email: ' Student@Example.com ',
      instituteId: 'institute-1',
      allowExistingInSameInstitute: true,
      writeLocal: jest.fn(),
    });

    expect(result).toEqual({
      status: 'existing',
      userId: 'user-1',
      payload: null,
    });
    expect(supabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back the auth user if the local transaction fails', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    supabaseAdmin.inviteUserByEmail.mockResolvedValue({
      user: { id: 'auth-user-1', email: 'student@example.com' },
      classification: 'created',
    });
    prisma.$transaction.mockRejectedValue(new Error('insert failed'));
    supabaseAdmin.deleteUser.mockResolvedValue({ success: true });

    await expect(
      service.provisionInvitedUser({
        action: 'student_provision',
        email: 'student@example.com',
        instituteId: 'institute-1',
        writeLocal: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(supabaseAdmin.inviteUserByEmail).toHaveBeenCalledWith(
      'student@example.com',
      {
        redirectTo: undefined,
        data: undefined,
      },
    );
    expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('auth-user-1');
  });

  it('does not delete pre-existing auth users when Supabase reports an existing account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    supabaseAdmin.inviteUserByEmail.mockResolvedValue({
      user: { id: 'auth-user-9', email: 'teacher@example.com' },
      classification: 'existing',
    });

    await expect(
      service.provisionInvitedUser({
        action: 'teacher_provision',
        email: 'teacher@example.com',
        instituteId: 'institute-1',
        writeLocal: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(supabaseAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('throws conflict when the email already belongs to another active local user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      instituteId: 'institute-2',
      isDeleted: false,
    });

    await expect(
      service.provisionInvitedUser({
        action: 'teacher_provision',
        email: 'teacher@example.com',
        instituteId: 'institute-1',
        writeLocal: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(supabaseAdmin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
