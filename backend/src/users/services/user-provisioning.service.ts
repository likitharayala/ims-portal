import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Prisma, User } from '@prisma/client';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SUPABASE_ADMIN,
  type SupabaseAdminClient,
  type SupabaseAdminUser,
} from '../../integrations/supabase/supabase-admin.provider';

interface ProvisionLocalResult<TPayload> {
  appUser: User;
  payload: TPayload;
}

interface ProvisionUserInput<TPayload> {
  action: string;
  email: string;
  instituteId?: string;
  redirectTo?: string;
  metadata?: Record<string, unknown>;
  allowExistingInSameInstitute?: boolean;
  writeLocal: (
    tx: Prisma.TransactionClient,
    authUser: SupabaseAdminUser,
    normalizedEmail: string,
  ) => Promise<ProvisionLocalResult<TPayload>>;
}

interface ProvisionUserSuccess<TPayload> {
  status: 'created' | 'existing';
  userId: string;
  payload: TPayload | null;
}

interface CreateLocalAdminProvisioningInput {
  authUserId?: string;
  instituteName: string;
  normalizedEmail: string;
  phone: string;
  slug: string;
  adminRoleId: number;
  adminName: string;
  passwordHash: string;
  isEmailVerified: boolean;
  authProvider: 'custom' | 'supabase';
  authMigratedAt: Date | null;
  supabaseAuthId?: string | null;
  authMigrationStatus?: string | null;
  emailVerificationToken?: string | null;
  emailVerificationExpiresAt?: Date | null;
  featureIds: number[];
}

interface CreateLocalAdminProvisioningResult {
  instituteId: string;
  userId: string;
  user: User;
}

interface BackgroundAdminSupabaseProvisioningInput {
  userId: string;
  instituteId: string;
  email: string;
  plaintextPassword?: string;
}

interface BackgroundAdminFeatureProvisioningInput {
  userId: string;
  instituteId: string;
  featureIds: number[];
}

interface BackgroundAdminVerificationEmailInput {
  userId: string;
  instituteId: string;
  email: string;
  name: string;
  rawToken?: string;
}

interface RetryFailedProvisioningResult {
  supabaseRetried: boolean;
  featureRetried: boolean;
  emailRetried: boolean;
  completed: boolean;
}

interface ProvisioningStats {
  totalUsers: number;
  pendingProvisioning: number;
  completedProvisioning: number;
  failedProvisioning: number;
  retryCount: number;
  successRate: number;
}

interface RetryAllFailedProvisioningResult {
  attempted: number;
  completed: number;
  failed: number;
}

@Injectable()
export class UserProvisioningService {
  private static readonly inFlightEmails = new Set<string>();
  private static readonly AUTO_RETRY_LIMIT = 5;
  private static readonly AUTO_RETRY_COOLDOWN_MS = 60 * 60 * 1000;
  private readonly logger = new Logger(UserProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Inject(SUPABASE_ADMIN)
    private readonly supabaseAdmin: SupabaseAdminClient,
  ) {}

  async validateAdminSignup(email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);

    const [existingInstitute, existingUser] = await Promise.all([
      this.prisma.institute.findFirst({
        where: {
          email: normalizedEmail,
        },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          isDeleted: false,
        },
        select: { id: true },
      }),
    ]);

    if (existingInstitute) {
      throw new ConflictException('Institute already exists');
    }

    if (existingUser) {
      throw new ConflictException('User already exists');
    }
  }

  async createLocalAdminProvisioning(
    input: CreateLocalAdminProvisioningInput,
    txClient?: Prisma.TransactionClient,
  ): Promise<CreateLocalAdminProvisioningResult> {
    const execute = async (
      tx: Prisma.TransactionClient,
    ): Promise<CreateLocalAdminProvisioningResult> => {
      const institute = await tx.institute.create({
        data: {
          name: input.instituteName,
          email: input.normalizedEmail,
          phone: input.phone,
          slug: input.slug,
        },
      });

      const user = await tx.user.create({
        data: {
          ...(input.authUserId ? { id: input.authUserId } : {}),
          instituteId: institute.id,
          roleId: input.adminRoleId,
          name: input.adminName,
          email: input.normalizedEmail,
          phone: input.phone,
          authProvider: input.authProvider,
          authMigratedAt: input.authMigratedAt,
          supabaseAuthId: input.supabaseAuthId ?? null,
          authMigrationStatus: input.authMigrationStatus ?? null,
          pendingFeatureIds: input.featureIds,
          passwordHash: input.passwordHash,
          isEmailVerified: input.isEmailVerified,
          emailVerificationToken: input.emailVerificationToken ?? null,
          emailVerificationExpiresAt: input.emailVerificationExpiresAt ?? null,
        } as Prisma.UserUncheckedCreateInput,
      });

      return {
        instituteId: institute.id,
        userId: user.id,
        user,
      };
    };

    if (txClient) {
      return execute(txClient);
    }

    return this.prisma.$transaction(execute);
  }

  async provisionAdminInstituteFeatures(
    input: BackgroundAdminFeatureProvisioningInput,
  ): Promise<boolean> {
    const startedAt = Date.now();
    await this.markProvisioningAttempt(input.userId);

    this.logger.debug(
      JSON.stringify({
        action: 'feature_provisioning.started',
        userId: input.userId,
        instituteId: input.instituteId,
        featureCount: input.featureIds.length,
      }),
    );

    try {
      if (input.featureIds.length > 0) {
        await this.prisma.instituteFeature.createMany({
          data: input.featureIds.map((featureId) => ({
            instituteId: input.instituteId,
            featureId,
            isEnabled: true,
          })),
          skipDuplicates: true,
        });
      }

      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          pendingFeatureIds: [],
        },
      });

      this.logger.log(
        JSON.stringify({
          action: 'feature_provisioning.completed',
          userId: input.userId,
          instituteId: input.instituteId,
          featureCount: input.featureIds.length,
          durationMs: Date.now() - startedAt,
        }),
      );
      return true;
    } catch (error) {
      await this.recordProvisioningFailure(
        input.userId,
        `feature_provisioning_failed:${
          error instanceof Error ? error.message : 'unknown_feature_provisioning_error'
        }`,
      );
      this.logger.error(
        JSON.stringify({
          action: 'feature_provisioning.failed',
          userId: input.userId,
          instituteId: input.instituteId,
          featureCount: input.featureIds.length,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'unknown_feature_provisioning_error',
        }),
      );
      return false;
    }
  }

  async provisionAdminSupabaseUser(
    input: BackgroundAdminSupabaseProvisioningInput,
  ): Promise<boolean> {
    const startedAt = Date.now();
    const normalizedEmail = this.normalizeEmail(input.email);
    await this.markProvisioningAttempt(input.userId);

    this.logger.debug(
      JSON.stringify({
        action: 'supabase_provisioning.started',
        userId: input.userId,
        instituteId: input.instituteId,
        email: normalizedEmail,
      }),
    );

    try {
      const localUser = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          instituteId: true,
          email: true,
          supabaseAuthId: true,
          isDeleted: true,
        },
      });

      if (!localUser || localUser.isDeleted) {
        this.logger.warn(
          JSON.stringify({
            action: 'supabase_provisioning.skipped_missing_local_user',
            userId: input.userId,
            instituteId: input.instituteId,
            email: normalizedEmail,
            durationMs: Date.now() - startedAt,
          }),
        );
        return false;
      }

      if (localUser.supabaseAuthId) {
        this.logger.debug(
          JSON.stringify({
            action: 'supabase_provisioning.already_completed',
            userId: input.userId,
            instituteId: input.instituteId,
            email: normalizedEmail,
            authUserId: localUser.supabaseAuthId,
            durationMs: Date.now() - startedAt,
          }),
        );
        return true;
      }

      let authUser = await this.supabaseAdmin.findUserByEmail(normalizedEmail);

      if (authUser) {
        const linkedUser = await this.prisma.user.findFirst({
          where: {
            supabaseAuthId: authUser.id,
            NOT: { id: input.userId },
          },
          select: { id: true },
        });

        if (linkedUser) {
          await this.safeMarkSupabaseProvisioningFailed(
            input.userId,
            'supabase_provisioning_failed:supabase_auth_user_already_linked',
          );
          this.logger.error(
            JSON.stringify({
              action: 'supabase_provisioning.failed',
              userId: input.userId,
              instituteId: input.instituteId,
              email: normalizedEmail,
              authUserId: authUser.id,
              manualReconciliationRequired: true,
              durationMs: Date.now() - startedAt,
              error: 'supabase_auth_user_already_linked',
            }),
          );
          return false;
        }
      } else {
        if (input.plaintextPassword) {
          authUser = await this.signUpSupabaseUserWithVerification(
            normalizedEmail,
            input.plaintextPassword,
            {
              source: 'admin_signup_background',
              localUserId: input.userId,
              instituteId: input.instituteId,
            },
          );
        } else {
          const inviteResult = await this.supabaseAdmin.inviteUserByEmail(normalizedEmail, {
            redirectTo: this.getSupabaseInviteRedirectUrl(),
            data: {
              source: 'admin_signup_retry',
              localUserId: input.userId,
              instituteId: input.instituteId,
            },
          });
          authUser = inviteResult.user;
        }
      }

      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          supabaseAuthId: authUser.id,
          authMigrationStatus: 'completed',
          authMigratedAt: new Date(),
          lastMigrationError: null,
        },
      });

      this.logger.log(
        JSON.stringify({
          action: 'supabase_provisioning.completed',
          userId: input.userId,
          instituteId: input.instituteId,
          email: normalizedEmail,
          authUserId: authUser.id,
          durationMs: Date.now() - startedAt,
        }),
      );
      return true;
    } catch (error) {
      await this.safeMarkSupabaseProvisioningFailed(
        input.userId,
        `supabase_provisioning_failed:${
          error instanceof Error ? error.message : 'unknown_supabase_provisioning_error'
        }`,
      );
      this.logger.error(
        JSON.stringify({
          action: 'supabase_provisioning.failed',
          userId: input.userId,
          instituteId: input.instituteId,
          email: normalizedEmail,
          manualReconciliationRequired: false,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'unknown_supabase_provisioning_error',
        }),
      );
      return false;
    }
  }

  async sendAdminVerificationEmail(
    input: BackgroundAdminVerificationEmailInput,
  ): Promise<boolean> {
    const startedAt = Date.now();
    await this.markProvisioningAttempt(input.userId);

    this.logger.debug(
      JSON.stringify({
        action: 'email_provisioning.started',
        instituteId: input.instituteId,
        userId: input.userId,
        email: input.email,
      }),
    );

    try {
      let rawToken = input.rawToken;

      if (!rawToken) {
        rawToken = await this.rotateVerificationToken(input.userId);
      }

      await this.email.sendVerificationEmail(input.email, input.name, rawToken);

      this.logger.log(
        JSON.stringify({
          action: 'email_provisioning.completed',
          instituteId: input.instituteId,
          userId: input.userId,
          email: input.email,
          durationMs: Date.now() - startedAt,
        }),
      );

      return true;
    } catch (error) {
      await this.recordProvisioningFailure(
        input.userId,
        `email_provisioning_failed:${
          error instanceof Error ? error.message : 'unknown_email_provisioning_error'
        }`,
      );
      this.logger.error(
        JSON.stringify({
          action: 'email_provisioning.failed',
          instituteId: input.instituteId,
          userId: input.userId,
          email: input.email,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'unknown_email_provisioning_error',
        }),
      );
      return false;
    }
  }

  async retryFailedProvisioning(userId: string): Promise<RetryFailedProvisioningResult> {
    const startedAt = Date.now();
    this.logger.log(
      JSON.stringify({
        action: 'retry.started',
        userId,
      }),
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        instituteId: true,
        email: true,
        name: true,
        isDeleted: true,
        isEmailVerified: true,
        supabaseAuthId: true,
        authMigrationStatus: true,
        pendingFeatureIds: true,
      },
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }

    let supabaseRetried = false;
    let featureRetried = false;
    let emailRetried = false;
    let completed = true;

    if (!user.supabaseAuthId || user.authMigrationStatus === 'failed') {
      supabaseRetried = true;
      const supabaseSucceeded = await this.provisionAdminSupabaseUser({
        userId: user.id,
        instituteId: user.instituteId,
        email: user.email,
      });
      completed = completed && supabaseSucceeded;
    }

    if (user.pendingFeatureIds.length > 0) {
      featureRetried = true;
      const featureSucceeded = await this.provisionAdminInstituteFeatures({
        userId: user.id,
        instituteId: user.instituteId,
        featureIds: user.pendingFeatureIds,
      });
      completed = completed && featureSucceeded;
    }

    if (!user.isEmailVerified) {
      emailRetried = true;
      const emailSucceeded = await this.sendAdminVerificationEmail({
        userId: user.id,
        instituteId: user.instituteId,
        email: user.email,
        name: user.name,
      });
      completed = completed && emailSucceeded;
    }

    const logAction = completed ? 'retry.completed' : 'retry.failed';
    this.logger.log(
      JSON.stringify({
        action: logAction,
        userId,
        instituteId: user.instituteId,
        supabaseRetried,
        featureRetried,
        emailRetried,
        durationMs: Date.now() - startedAt,
      }),
    );

    return {
      supabaseRetried,
      featureRetried,
      emailRetried,
      completed,
    };
  }

  async getProvisioningStats(): Promise<ProvisioningStats> {
    const [totalUsers, pendingProvisioning, completedProvisioning, failedProvisioning, retryAggregate] =
      await Promise.all([
        this.prisma.user.count({
          where: {
            isDeleted: false,
          },
        }),
        this.prisma.user.count({
          where: {
            isDeleted: false,
            OR: [
              { authMigrationStatus: 'pending' },
              { pendingFeatureIds: { isEmpty: false } },
            ],
          },
        }),
        this.prisma.user.count({
          where: {
            isDeleted: false,
            authMigrationStatus: 'completed',
            pendingFeatureIds: { isEmpty: true },
            lastMigrationError: null,
          },
        }),
        this.prisma.user.count({
          where: {
            isDeleted: false,
            OR: [{ authMigrationStatus: 'failed' }, { lastMigrationError: { not: null } }],
          },
        }),
        this.prisma.user.aggregate({
          where: {
            isDeleted: false,
          },
          _sum: {
            migrationRetryCount: true,
          },
        }),
      ]);

    const successRateBase = completedProvisioning + failedProvisioning;
    const successRate =
      successRateBase === 0 ? 0 : Number(((completedProvisioning / successRateBase) * 100).toFixed(2));

    return {
      totalUsers,
      pendingProvisioning,
      completedProvisioning,
      failedProvisioning,
      retryCount: retryAggregate._sum.migrationRetryCount ?? 0,
      successRate,
    };
  }

  async retryAllFailedProvisioning(limit: number): Promise<RetryAllFailedProvisioningResult> {
    const startedAt = Date.now();
    const safeLimit = Math.max(0, Math.floor(limit));

    this.logger.log(
      JSON.stringify({
        action: 'auto_retry.started',
        limit: safeLimit,
      }),
    );

    if (safeLimit === 0) {
      const emptyResult = {
        attempted: 0,
        completed: 0,
        failed: 0,
      };

      this.logger.log(
        JSON.stringify({
          action: 'auto_retry.completed',
          ...emptyResult,
          durationMs: Date.now() - startedAt,
        }),
      );

      return emptyResult;
    }

    const cooldownThreshold = new Date(Date.now() - UserProvisioningService.AUTO_RETRY_COOLDOWN_MS);
    const failedUsers = await this.prisma.user.findMany({
      where: {
        isDeleted: false,
        migrationRetryCount: {
          lt: UserProvisioningService.AUTO_RETRY_LIMIT,
        },
        AND: [
          {
            OR: [{ authMigrationStatus: 'failed' }, { lastMigrationError: { not: null } }],
          },
          {
            OR: [
              { lastMigrationAttempt: null },
              { lastMigrationAttempt: { lte: cooldownThreshold } },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: [{ lastMigrationAttempt: 'asc' }, { createdAt: 'asc' }],
      take: safeLimit,
    });

    let completed = 0;
    let failed = 0;

    for (const user of failedUsers) {
      try {
        const result = await this.retryFailedProvisioning(user.id);
        if (result.completed) {
          completed += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.error(
          JSON.stringify({
            action: 'auto_retry.failed',
            userId: user.id,
            error: error instanceof Error ? error.message : 'unknown_auto_retry_error',
          }),
        );
      }
    }

    const result = {
      attempted: failedUsers.length,
      completed,
      failed,
    };

    this.logger.log(
      JSON.stringify({
        action: failed > 0 ? 'auto_retry.failed' : 'auto_retry.completed',
        ...result,
        durationMs: Date.now() - startedAt,
      }),
    );

    return result;
  }

  async provisionInvitedUser<TPayload>(
    input: ProvisionUserInput<TPayload>,
  ): Promise<ProvisionUserSuccess<TPayload>> {
    const normalizedEmail = this.normalizeEmail(input.email);

    if (UserProvisioningService.inFlightEmails.has(normalizedEmail)) {
      throw new ConflictException('User provisioning is already in progress for this email');
    }

    UserProvisioningService.inFlightEmails.add(normalizedEmail);

    let authUser: SupabaseAdminUser | null = null;
    let authUserOwnedByRequest = false;
    let rollbackAttempted = false;
    let rollbackSucceeded = false;

    try {
      const existingLocalUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingLocalUser) {
        if (existingLocalUser.isDeleted) {
          throw new ConflictException(
            'A deleted user with this email already exists. Use a different email.',
          );
        }

        if (
          input.allowExistingInSameInstitute &&
          input.instituteId &&
          existingLocalUser.instituteId === input.instituteId
        ) {
          this.logger.log(
            JSON.stringify({
              action: `${input.action}.existing_local_user`,
              email: normalizedEmail,
              instituteId: existingLocalUser.instituteId,
              authUserId: existingLocalUser.id,
              localUserId: existingLocalUser.id,
              rollbackAttempted: false,
              rollbackSucceeded: false,
              manualReconciliationRequired: false,
            }),
          );

          return {
            status: 'existing',
            userId: existingLocalUser.id,
            payload: null,
          };
        }

        throw new ConflictException('A user with this email already exists');
      }

      const inviteResult = await this.supabaseAdmin.inviteUserByEmail(normalizedEmail, {
        redirectTo: input.redirectTo,
        data: input.metadata,
      });

      authUser = inviteResult.user;
      authUserOwnedByRequest = inviteResult.classification === 'created';

      if (inviteResult.classification === 'existing') {
        this.logger.warn(
          JSON.stringify({
            action: `${input.action}.existing_auth_user`,
            email: normalizedEmail,
            instituteId: input.instituteId ?? null,
            authUserId: authUser.id,
            localUserId: null,
            rollbackAttempted: false,
            rollbackSucceeded: false,
            manualReconciliationRequired: true,
          }),
        );

        throw new ConflictException(
          'An auth account with this email already exists. Manual reconciliation is required.',
        );
      }

      const result = await this.prisma.$transaction((tx) =>
        input.writeLocal(tx, authUser as SupabaseAdminUser, normalizedEmail),
      );

      this.logger.log(
        JSON.stringify({
          action: `${input.action}.created`,
          email: normalizedEmail,
          instituteId: result.appUser.instituteId,
          authUserId: authUser.id,
          localUserId: result.appUser.id,
          rollbackAttempted: false,
          rollbackSucceeded: false,
          manualReconciliationRequired: false,
        }),
      );

      return {
        status: 'created',
        userId: result.appUser.id,
        payload: result.payload,
      };
    } catch (error) {
      if (authUser?.id && authUserOwnedByRequest) {
        rollbackAttempted = true;
        try {
          await this.supabaseAdmin.deleteUser(authUser.id);
          rollbackSucceeded = true;
        } catch (rollbackError) {
          this.logger.error(
            JSON.stringify({
              action: `${input.action}.rollback_failed`,
              email: normalizedEmail,
              instituteId: input.instituteId ?? null,
              authUserId: authUser.id,
              localUserId: null,
              rollbackAttempted: true,
              rollbackSucceeded: false,
              manualReconciliationRequired: true,
              error:
                rollbackError instanceof Error
                  ? rollbackError.message
                  : 'unknown_supabase_rollback_error',
            }),
          );
        }
      }

      this.logger.error(
        JSON.stringify({
          action: `${input.action}.failed`,
          email: normalizedEmail,
          instituteId: input.instituteId ?? null,
          authUserId: authUser?.id ?? null,
          localUserId: null,
          rollbackAttempted,
          rollbackSucceeded,
          manualReconciliationRequired: rollbackAttempted && !rollbackSucceeded,
          error: error instanceof Error ? error.message : 'unknown_provisioning_error',
        }),
      );

      if (error instanceof ConflictException) {
        throw error;
      }

      if (rollbackAttempted && !rollbackSucceeded) {
        throw new InternalServerErrorException(
          'User provisioning failed and auth rollback also failed',
        );
      }

      throw new InternalServerErrorException('User provisioning failed');
    } finally {
      UserProvisioningService.inFlightEmails.delete(normalizedEmail);
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getSupabaseInviteRedirectUrl(): string {
    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/+$/, '') ?? '';
    return `${frontendUrl}/auth/callback`;
  }

  private async signUpSupabaseUserWithVerification(
    email: string,
    password: string,
    metadata: Record<string, unknown>,
  ): Promise<SupabaseAdminUser> {
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '') ?? '';
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

    if (!supabaseUrl || !apiKey) {
      throw new Error('Supabase signup configuration is missing');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        options: {
          emailRedirectTo: this.getSupabaseInviteRedirectUrl(),
          data: metadata,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      user?: { id?: string; email?: string };
      msg?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.user?.id) {
      throw new Error(
        payload.error_description ??
          payload.msg ??
          payload.error ??
          'supabase_signup_failed',
      );
    }

    return {
      id: payload.user.id,
      email: payload.user.email ?? email,
    };
  }

  private async rotateVerificationToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    });

    return rawToken;
  }

  private hashToken(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private async markProvisioningAttempt(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastMigrationAttempt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'provisioning_attempt_update_failed',
          userId,
          error:
            error instanceof Error ? error.message : 'unknown_provisioning_attempt_update_error',
        }),
      );
    }
  }

  private async recordProvisioningFailure(userId: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastMigrationError: errorMessage,
          migrationRetryCount: {
            increment: 1,
          },
          lastMigrationAttempt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'provisioning_failure_update_failed',
          userId,
          error: error instanceof Error ? error.message : 'unknown_provisioning_failure_update_error',
        }),
      );
    }
  }

  private async safeMarkSupabaseProvisioningFailed(
    userId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          authMigrationStatus: 'failed',
          lastMigrationError: errorMessage,
          migrationRetryCount: {
            increment: 1,
          },
          lastMigrationAttempt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'supabase_provisioning.mark_failed_update_failed',
          userId,
          error:
            error instanceof Error ? error.message : 'unknown_supabase_mark_failed_error',
        }),
      );
    }
  }
}
