import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
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

@Injectable()
export class UserProvisioningService {
  private static readonly inFlightEmails = new Set<string>();
  private readonly logger = new Logger(UserProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPABASE_ADMIN)
    private readonly supabaseAdmin: SupabaseAdminClient,
  ) {}

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
}
