import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthProvider, User } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import {
  SUPABASE_ADMIN,
  type SupabaseAdminClient,
  type SupabaseAdminUser,
} from '../../integrations/supabase/supabase-admin.provider';
import { PrismaService } from '../../prisma/prisma.service';

type MigrationReason =
  | 'already_migrated'
  | 'not_custom'
  | 'dry_run'
  | 'rate_limited'
  | 'supabase_email_conflict'
  | 'supabase_create_failed'
  | 'database_update_failed'
  | 'retry_requires_password';

export interface UserAuthMigrationCandidate
  extends Pick<User, 'id' | 'email' | 'name' | 'instituteId' | 'authProvider' | 'supabaseAuthId'> {
  authMigrationStatus?: string | null;
}

export interface UserAuthMigrationResult {
  status: 'completed' | 'failed' | 'skipped';
  supabaseAuthId: string | null;
  manualReconciliationRequired: boolean;
  reason?: MigrationReason;
}

export interface UserAuthMigrationStats {
  totalUsers: number;
  customUsers: number;
  supabaseUsers: number;
  migratedUsers: number;
  failedMigrations: number;
  pendingMigrations: number;
}

export interface MigrationReadiness {
  safeToEnable: boolean;
  riskFactors: string[];
  recommendedNextStep: string;
}

@Injectable()
export class UserAuthMigrationService {
  private readonly logger = new Logger(UserAuthMigrationService.name);
  private readonly recentMigrationAttemptTimestamps: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
    @Inject(SUPABASE_ADMIN)
    private readonly supabaseAdmin: SupabaseAdminClient,
  ) {}

  async migrateUserAfterLegacyLogin(
    user: UserAuthMigrationCandidate,
    plaintextPassword: string,
  ): Promise<UserAuthMigrationResult> {
    const startedAt = Date.now();
    const isRetry = user.authMigrationStatus === 'failed';

    if (user.authProvider !== 'custom') {
      return {
        status: 'skipped',
        supabaseAuthId: user.supabaseAuthId,
        manualReconciliationRequired: false,
        reason: 'not_custom',
      };
    }

    if (user.supabaseAuthId) {
      return {
        status: 'completed',
        supabaseAuthId: user.supabaseAuthId,
        manualReconciliationRequired: false,
        reason: 'already_migrated',
      };
    }

    if (this.isDryRunEnabled()) {
      this.logger.log(
        JSON.stringify({
          action: 'user_auth_migration.dry_run',
          userId: user.id,
          instituteId: user.instituteId,
          email: this.normalizeEmail(user.email),
          durationMs: Date.now() - startedAt,
          isRetry,
        }),
      );

      return {
        status: 'skipped',
        supabaseAuthId: null,
        manualReconciliationRequired: false,
        reason: 'dry_run',
      };
    }

    if (!this.tryConsumeMigrationSlot()) {
      this.logger.warn(
        JSON.stringify({
          action: 'user_auth_migration.rate_limited',
          userId: user.id,
          instituteId: user.instituteId,
          email: this.normalizeEmail(user.email),
          durationMs: Date.now() - startedAt,
          isRetry,
          maxPerMinute: this.getMigrationMaxPerMinute(),
        }),
      );

      return {
        status: 'skipped',
        supabaseAuthId: null,
        manualReconciliationRequired: false,
        reason: 'rate_limited',
      };
    }

    await this.safeAuditLog('USER_AUTH_MIGRATION_STARTED', user, {
      authProvider: user.authProvider,
    });

    const normalizedEmail = this.normalizeEmail(user.email);
    let authUser: SupabaseAdminUser | null = null;
    let authUserCreatedByRequest = false;

    try {
      const existingSupabaseUser = await this.supabaseAdmin.findUserByEmail(normalizedEmail);

      if (existingSupabaseUser) {
        const linkedUser = await this.prisma.user.findFirst({
          where: {
            supabaseAuthId: existingSupabaseUser.id,
            NOT: { id: user.id },
          },
          select: { id: true },
        });

        if (linkedUser) {
          await this.safeMarkMigrationFailed(user.id);
          await this.safeAuditLog('USER_AUTH_MIGRATION_FAILED', user, {
            reason: 'supabase_email_conflict',
            existingSupabaseAuthId: existingSupabaseUser.id,
          });

          this.logger.error(
            JSON.stringify({
              action: 'user_auth_migration.supabase_email_conflict',
              userId: user.id,
              instituteId: user.instituteId,
              email: normalizedEmail,
              authUserId: existingSupabaseUser.id,
              localUserId: user.id,
              rollbackAttempted: false,
              rollbackSucceeded: false,
              manualReconciliationRequired: true,
              durationMs: Date.now() - startedAt,
              isRetry,
            }),
          );

          return {
            status: 'failed',
            supabaseAuthId: null,
            manualReconciliationRequired: true,
            reason: 'supabase_email_conflict',
          };
        }

        authUser = existingSupabaseUser;
      } else {
        authUser = await this.supabaseAdmin.createUser(normalizedEmail, {
          password: plaintextPassword,
          emailConfirm: true,
          userMetadata: {
            migratedFrom: 'custom',
            localUserId: user.id,
          },
        });
        authUserCreatedByRequest = true;
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'user_auth_migration.supabase_create_failed',
          userId: user.id,
          instituteId: user.instituteId,
          email: normalizedEmail,
          authUserId: null,
          localUserId: user.id,
          rollbackAttempted: false,
          rollbackSucceeded: false,
          manualReconciliationRequired: false,
          durationMs: Date.now() - startedAt,
          isRetry,
          error: error instanceof Error ? error.message : 'unknown_supabase_create_error',
        }),
      );

      await this.safeAuditLog('USER_AUTH_MIGRATION_FAILED', user, {
        reason: 'supabase_create_failed',
      });

      return {
        status: 'failed',
        supabaseAuthId: null,
        manualReconciliationRequired: false,
        reason: 'supabase_create_failed',
      };
    }

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          authProvider: 'supabase' as AuthProvider,
          supabaseAuthId: authUser.id,
          authMigrationStatus: 'completed',
          authMigratedAt: new Date(),
        },
      });

      this.logger.log(
        JSON.stringify({
          action: 'user_auth_migration.completed',
          userId: user.id,
          instituteId: user.instituteId,
          email: normalizedEmail,
          authUserId: authUser.id,
          localUserId: user.id,
          rollbackAttempted: false,
          rollbackSucceeded: false,
          manualReconciliationRequired: false,
          durationMs: Date.now() - startedAt,
          isRetry,
        }),
      );

      await this.safeAuditLog('USER_AUTH_MIGRATION_COMPLETED', user, {
        supabaseAuthId: authUser.id,
      });

      return {
        status: 'completed',
        supabaseAuthId: authUser.id,
        manualReconciliationRequired: false,
      };
    } catch (error) {
      let rollbackSucceeded = false;

      if (authUserCreatedByRequest) {
        try {
          await this.supabaseAdmin.deleteUser(authUser.id);
          rollbackSucceeded = true;
        } catch (rollbackError) {
          this.logger.error(
            JSON.stringify({
              action: 'user_auth_migration.rollback_failed',
              userId: user.id,
              instituteId: user.instituteId,
              email: normalizedEmail,
              authUserId: authUser.id,
              localUserId: user.id,
              rollbackAttempted: true,
              rollbackSucceeded: false,
              manualReconciliationRequired: true,
              durationMs: Date.now() - startedAt,
              isRetry,
              error:
                rollbackError instanceof Error
                  ? rollbackError.message
                  : 'unknown_supabase_delete_error',
            }),
          );

          await this.safeMarkMigrationFailed(user.id);
        }
      }

      this.logger.error(
        JSON.stringify({
          action: 'user_auth_migration.failed',
          userId: user.id,
          instituteId: user.instituteId,
          email: normalizedEmail,
          authUserId: authUser.id,
          localUserId: user.id,
          rollbackAttempted: authUserCreatedByRequest,
          rollbackSucceeded,
          manualReconciliationRequired: authUserCreatedByRequest && !rollbackSucceeded,
          durationMs: Date.now() - startedAt,
          isRetry,
          error: error instanceof Error ? error.message : 'unknown_database_update_error',
        }),
      );

      await this.safeAuditLog('USER_AUTH_MIGRATION_FAILED', user, {
        reason: 'database_update_failed',
        rollbackSucceeded,
      });

      return {
        status: 'failed',
        supabaseAuthId: null,
        manualReconciliationRequired: authUserCreatedByRequest && !rollbackSucceeded,
        reason: 'database_update_failed',
      };
    }
  }

  async getMigrationStats(): Promise<UserAuthMigrationStats> {
    const [totalUsers, customUsers, supabaseUsers, migratedUsers, failedMigrations, pendingMigrations] =
      await Promise.all([
        this.prisma.user.count({
          where: {
            isDeleted: false,
          },
        }),
        this.countUsersByAuthProvider('custom'),
        this.countUsersByAuthProvider('supabase'),
        this.countUsersByMigrationStatus('completed'),
        this.countUsersByMigrationStatus('failed'),
        this.countUsersByMigrationStatus('pending'),
      ]);

    return {
      totalUsers,
      customUsers,
      supabaseUsers,
      migratedUsers,
      failedMigrations,
      pendingMigrations,
    };
  }

  async isMigrationSafeToEnable(): Promise<boolean> {
    const readiness = await this.getMigrationReadiness();
    return readiness.safeToEnable;
  }

  async getMigrationReadiness(): Promise<MigrationReadiness> {
    const riskFactors: string[] = [];
    let statsAccessible = false;
    let stats: UserAuthMigrationStats | null = null;

    try {
      stats = await this.getMigrationStats();
      statsAccessible = true;
    } catch (error) {
      riskFactors.push('Migration stats query is not accessible');
      this.logger.error(
        JSON.stringify({
          action: 'user_auth_migration.readiness_stats_failed',
          error: error instanceof Error ? error.message : 'unknown_stats_error',
        }),
      );
    }

    const supabaseConnectivityWorking = await this.checkSupabaseConnectivity();
    if (!supabaseConnectivityWorking) {
      riskFactors.push('Supabase connectivity check failed');
    }

    if (!this.isSupabaseProvisioningEnabled()) {
      riskFactors.push('Supabase provisioning is disabled');
    }

    if (this.isDryRunEnabled()) {
      riskFactors.push('Login-triggered auth migration is in dry-run mode');
    }

    if (statsAccessible && stats && stats.failedMigrations > 0) {
      riskFactors.push(`There are ${stats.failedMigrations} failed migrations to review`);
    }

    const safeToEnable = riskFactors.length === 0;
    const recommendedNextStep = safeToEnable
      ? 'Safe to enable login-triggered migration for a small pilot cohort.'
      : !supabaseConnectivityWorking
        ? 'Fix Supabase connectivity before enabling migration.'
        : !statsAccessible
          ? 'Restore migration stats visibility before enabling migration.'
          : stats && stats.failedMigrations > 0
            ? 'Review and retry failed migrations before enabling migration.'
            : this.isDryRunEnabled()
              ? 'Disable dry-run and validate on a pilot cohort when ready.'
              : 'Resolve the listed risk factors before enabling migration.';

    return {
      safeToEnable,
      riskFactors,
      recommendedNextStep,
    };
  }

  async retryFailedMigration(userId: string): Promise<UserAuthMigrationResult> {
    const startedAt = Date.now();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        instituteId: true,
        authProvider: true,
        supabaseAuthId: true,
        authMigrationStatus: true,
        isDeleted: true,
      },
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }

    if (user.supabaseAuthId) {
      return {
        status: 'completed',
        supabaseAuthId: user.supabaseAuthId,
        manualReconciliationRequired: false,
        reason: 'already_migrated',
      };
    }

    if (user.authMigrationStatus !== 'failed') {
      return {
        status: 'skipped',
        supabaseAuthId: user.supabaseAuthId,
        manualReconciliationRequired: false,
        reason: 'not_custom',
      };
    }

    const normalizedEmail = this.normalizeEmail(user.email);
    this.logger.log(
      JSON.stringify({
        action: 'user_auth_migration.retry_attempted',
        userId: user.id,
        instituteId: user.instituteId,
        email: normalizedEmail,
      }),
    );

    const existingSupabaseUser = await this.supabaseAdmin.findUserByEmail(normalizedEmail);
    if (!existingSupabaseUser) {
      this.logger.warn(
        JSON.stringify({
          action: 'user_auth_migration.retry_requires_password',
          userId: user.id,
          instituteId: user.instituteId,
          email: normalizedEmail,
          durationMs: Date.now() - startedAt,
          isRetry: true,
        }),
      );

      return {
        status: 'failed',
        supabaseAuthId: null,
        manualReconciliationRequired: false,
        reason: 'retry_requires_password',
      };
    }

    const linkedUser = await this.prisma.user.findFirst({
      where: {
        supabaseAuthId: existingSupabaseUser.id,
        NOT: { id: user.id },
      },
      select: { id: true },
    });

    if (linkedUser) {
      await this.safeMarkMigrationFailed(user.id);

      this.logger.error(
        JSON.stringify({
          action: 'user_auth_migration.retry_conflict',
          userId: user.id,
          instituteId: user.instituteId,
          email: normalizedEmail,
          authUserId: existingSupabaseUser.id,
          localUserId: user.id,
          manualReconciliationRequired: true,
          durationMs: Date.now() - startedAt,
          isRetry: true,
        }),
      );

      return {
        status: 'failed',
        supabaseAuthId: null,
        manualReconciliationRequired: true,
        reason: 'supabase_email_conflict',
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        authProvider: 'supabase' as AuthProvider,
        supabaseAuthId: existingSupabaseUser.id,
        authMigrationStatus: 'completed',
        authMigratedAt: new Date(),
      },
    });

    this.logger.log(
      JSON.stringify({
        action: 'user_auth_migration.retry_completed',
        userId: user.id,
        instituteId: user.instituteId,
        email: normalizedEmail,
        authUserId: existingSupabaseUser.id,
        localUserId: user.id,
        durationMs: Date.now() - startedAt,
        isRetry: true,
      }),
    );

    await this.safeAuditLog('USER_AUTH_MIGRATION_COMPLETED', user, {
      supabaseAuthId: existingSupabaseUser.id,
      retried: true,
    });

    return {
      status: 'completed',
      supabaseAuthId: existingSupabaseUser.id,
      manualReconciliationRequired: false,
    };
  }

  private countUsersByAuthProvider(authProvider: AuthProvider): Promise<number> {
    return this.prisma.user.count({
      where: {
        authProvider,
        isDeleted: false,
      },
    });
  }

  private countUsersByMigrationStatus(status: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        authMigrationStatus: status,
        isDeleted: false,
      },
    });
  }

  private async safeMarkMigrationFailed(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          authMigrationStatus: 'failed',
        },
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'user_auth_migration.mark_failed_update_failed',
          userId,
          error: error instanceof Error ? error.message : 'unknown_mark_failed_error',
        }),
      );
    }
  }

  private async safeAuditLog(
    action: string,
    user: UserAuthMigrationCandidate,
    newValues?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLog.record({
        instituteId: user.instituteId,
        userId: user.id,
        action,
        targetId: user.id,
        targetType: 'user',
        newValues,
      });
    } catch {}
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async checkSupabaseConnectivity(): Promise<boolean> {
    if (!this.isSupabaseProvisioningEnabled()) {
      return false;
    }

    try {
      await this.supabaseAdmin.findUserByEmail('migration-healthcheck@invalid.local');
      return true;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          action: 'user_auth_migration.connectivity_failed',
          error: error instanceof Error ? error.message : 'unknown_connectivity_error',
        }),
      );
      return false;
    }
  }

  private isDryRunEnabled(): boolean {
    return (
      (this.config.get<string>('LOGIN_TRIGGERED_AUTH_MIGRATION_DRY_RUN') ?? 'false').toLowerCase() ===
      'true'
    );
  }

  private isSupabaseProvisioningEnabled(): boolean {
    return (this.config.get<string>('SUPABASE_PROVISIONING_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  private getMigrationMaxPerMinute(): number {
    const rawValue = this.config.get<string>('LOGIN_TRIGGERED_AUTH_MIGRATION_MAX_PER_MINUTE') ?? '0';
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private tryConsumeMigrationSlot(): boolean {
    const maxPerMinute = this.getMigrationMaxPerMinute();
    if (maxPerMinute <= 0) {
      return true;
    }

    const now = Date.now();
    const cutoff = now - 60_000;

    while (
      this.recentMigrationAttemptTimestamps.length > 0 &&
      this.recentMigrationAttemptTimestamps[0] < cutoff
    ) {
      this.recentMigrationAttemptTimestamps.shift();
    }

    if (this.recentMigrationAttemptTimestamps.length >= maxPerMinute) {
      return false;
    }

    this.recentMigrationAttemptTimestamps.push(now);
    return true;
  }
}
