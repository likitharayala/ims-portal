import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';
import { UserAuthMigrationService } from '../users/services/user-auth-migration.service';
import { UserProvisioningService } from '../users/services/user-provisioning.service';
import { LegacyAuthService } from './services/legacy-auth.service';
import { SupabaseAuthService } from './services/supabase-auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import {
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  ResendVerificationDto,
} from './dto/auth.dto';
import { Feature } from '../common/decorators/feature.decorator';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly legacyAuthService: LegacyAuthService;
  private readonly supabaseAuthService?: SupabaseAuthService;
  private readonly userAuthMigrationService?: UserAuthMigrationService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly email: EmailService,
    private readonly userProvisioning: UserProvisioningService,
    legacyAuthService?: LegacyAuthService,
    supabaseAuthService?: SupabaseAuthService,
    userAuthMigrationService?: UserAuthMigrationService,
  ) {
    this.legacyAuthService =
      legacyAuthService ?? new LegacyAuthService(this.prisma, this.jwtService, this.config);
    this.supabaseAuthService = supabaseAuthService;
    this.userAuthMigrationService = userAuthMigrationService;
  }

  // ──────────────────────────────────────────────────────────────────
  // Signup
  // ──────────────────────────────────────────────────────────────────
  async signup(dto: SignupDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const supabaseProvisioningEnabled = this.isSupabaseProvisioningEnabled();

    // Check uniqueness
    const existingUser = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, isDeleted: false },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingInstitute = await this.prisma.institute.findFirst({
      where: { name: dto.instituteName },
    });
    if (existingInstitute) {
      throw new ConflictException('An institute with this name already exists');
    }

    const slug = this.generateSlug(dto.instituteName);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Resolve feature IDs
    const featureRecords = await this.prisma.feature.findMany({
      where: { name: { in: dto.features } },
    });

    // Admin role id = 1
    const adminRole = await this.prisma.role.findFirst({ where: { name: 'admin' } });
    if (!adminRole) {
      throw new InternalServerErrorException('Admin role not seeded');
    }

    let instituteId: string;
    let userId: string;

    if (supabaseProvisioningEnabled) {
      const provisioningResult = await this.userProvisioning.provisionInvitedUser<{
        instituteId: string;
        userId: string;
      }>({
        action: 'admin_signup',
        email: normalizedEmail,
        redirectTo: this.getSupabaseInviteRedirectUrl(),
        metadata: {
          instituteName: dto.instituteName,
          role: 'admin',
        },
        writeLocal: async (tx, authUser, email) => {
          const institute = await tx.institute.create({
            data: { name: dto.instituteName, email, phone: dto.phone, slug },
          });

          const user = await tx.user.create({
            data: {
              id: authUser.id,
              instituteId: institute.id,
              roleId: adminRole.id,
              name: dto.name,
              email,
              phone: dto.phone,
              authProvider: 'supabase',
              authMigratedAt: null,
              passwordHash,
              isEmailVerified: false,
            } as any,
          });

          await tx.instituteFeature.createMany({
            data: featureRecords.map((f) => ({
              instituteId: institute.id,
              featureId: f.id,
              isEnabled: true,
            })),
          });

          return {
            appUser: user,
            payload: {
              instituteId: institute.id,
              userId: user.id,
            },
          };
        },
      });

      if (provisioningResult.status !== 'created' || !provisioningResult.payload) {
        throw new ConflictException('An account with this email already exists');
      }

      instituteId = provisioningResult.payload.instituteId;
      userId = provisioningResult.payload.userId;
    } else {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const result = await this.prisma.$transaction(async (tx) => {
        const institute = await tx.institute.create({
          data: {
            name: dto.instituteName,
            email: normalizedEmail,
            phone: dto.phone,
            slug,
          },
        });

        const user = await tx.user.create({
          data: {
            instituteId: institute.id,
            roleId: adminRole.id,
            name: dto.name,
            email: normalizedEmail,
            phone: dto.phone,
            authProvider: 'custom',
            authMigratedAt: null,
            passwordHash,
            emailVerificationToken: tokenHash,
            emailVerificationExpiresAt: expiresAt,
            isEmailVerified: false,
          } as any,
        });

        await tx.instituteFeature.createMany({
          data: featureRecords.map((f) => ({
            instituteId: institute.id,
            featureId: f.id,
            isEnabled: true,
          })),
        });

        return {
          instituteId: institute.id,
          userId: user.id,
          email: user.email,
          name: user.name,
          rawToken,
        };
      });

      instituteId = result.instituteId;
      userId = result.userId;

      try {
        await this.email.sendVerificationEmail(result.email, result.name, result.rawToken);
      } catch (err) {
        this.logger.error('Failed to send verification email', (err as Error).message);
      }
    }

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'SIGNUP',
        targetId: userId,
        targetType: 'user',
      });
    } catch {}

    return {
      message: supabaseProvisioningEnabled
        ? 'Account created. Check your email to complete your invite.'
        : 'Account created. Please verify your email to continue.',
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Verify Email
  // ──────────────────────────────────────────────────────────────────
  async verifyEmail(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: tokenHash, isDeleted: false },
    });

    if (!user) {
      throw new BadRequestException('Invalid or already used verification link');
    }

    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new BadRequestException('Verification link has expired. Please request a new one.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Resend Verification
  // ──────────────────────────────────────────────────────────────────
  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isEmailVerified: false, isDeleted: false },
    });

    // Return same response regardless to prevent user enumeration
    if (!user) {
      return { message: 'If your email is registered and unverified, a new link has been sent.' };
    }

    if (user.authProvider === 'supabase') {
      return { message: 'If your email is registered and unverified, a new link has been sent.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: tokenHash, emailVerificationExpiresAt: expiresAt },
    });

    try {
      await this.email.sendVerificationEmail(user.email, user.name, rawToken);
    } catch (err) {
      this.logger.error('Failed to resend verification email', (err as Error).message);
    }

    return { message: 'If your email is registered and unverified, a new link has been sent.' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Login
  // ──────────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ipAddress?: string) {
    const identifier = dto.emailOrPhone.trim();
    const normalizedEmail = identifier.toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { phone: identifier }],
        isDeleted: false,
      },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.authProvider === 'supabase') {
      if (!this.isDualAuthEnabled()) {
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!this.supabaseAuthService) {
        throw new InternalServerErrorException('Supabase auth service is not available');
      }

      const result = await this.supabaseAuthService.signIn(user.email, dto.password);

      if (
        result.identity.sub !== user.id ||
        result.identity.auth_provider !== 'supabase' ||
        result.identity.institute_id !== user.instituteId
      ) {
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          sessionId: result.identity.session_id,
          lastLoginAt: new Date(),
        },
      });

      const response = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        authProvider: 'supabase' as const,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.name,
          instituteId: user.instituteId,
          mustChangePassword: user.mustChangePassword,
        },
      };

      try {
        await this.auditLog.record({
          instituteId: user.instituteId,
          userId: user.id,
          action: 'LOGIN',
          targetId: user.id,
          targetType: 'user',
          ipAddress,
        });
      } catch {}

      return response;
    }

    const result = await this.legacyAuthService.login(dto);
    const response = {
      ...result,
      authProvider: 'custom' as const,
    };

    try {
      await this.auditLog.record({
        instituteId: result.user.instituteId,
        userId: result.user.id,
        action: 'LOGIN',
        targetId: result.user.id,
        targetType: 'user',
        ipAddress,
      });
    } catch {}

    if (user.authProvider === 'custom' && this.isLoginTriggeredAuthMigrationEnabled()) {
      void this.triggerLegacyUserMigration(user, dto.password);
    }

    return response;
  }

  // ──────────────────────────────────────────────────────────────────
  // Logout
  // ──────────────────────────────────────────────────────────────────
  async logout(userId: string, instituteId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authProvider: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.authProvider === 'supabase' && !this.isDualAuthEnabled()) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionId: null, refreshTokenHash: null },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'LOGOUT',
        targetId: userId,
        targetType: 'user',
      });
    } catch {}

    return { message: 'Logged out successfully' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Refresh Tokens
  // ──────────────────────────────────────────────────────────────────
  async refresh(dto: RefreshDto) {
    const legacyPayload = this.tryParseLegacyRefreshToken(dto.refreshToken);

    if (legacyPayload?.type === 'refresh' && legacyPayload.sub) {
      const user = await this.prisma.user.findUnique({
        where: { id: legacyPayload.sub },
        select: {
          authProvider: true,
        },
      });

      if (user?.authProvider === 'supabase') {
        throw new UnauthorizedException('Invalid credentials');
      }

      return this.legacyAuthService.refresh(dto);
    }

    if (!this.isDualAuthEnabled()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!this.supabaseAuthService) {
      throw new InternalServerErrorException('Supabase auth service is not available');
    }

    const result = await this.supabaseAuthService.refreshSession(dto.refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: result.identity.sub },
      include: { role: true },
    });

    if (!user || user.isDeleted || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    if (user.authProvider !== 'supabase') {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.sessionId !== result.identity.session_id) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALIDATED',
        message: 'Session expired. Please log in again.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        sessionId: result.identity.session_id,
        lastLoginAt: new Date(),
      },
    });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      authProvider: 'supabase' as const,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        instituteId: user.instituteId,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Forgot Password
  // ──────────────────────────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isDeleted: false },
    });

    // Always return same response to prevent enumeration
    const genericResponse = {
      message: 'If this email is registered, a reset link has been sent.',
    };

    if (!user) return genericResponse;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: tokenHash, passwordResetExpiresAt: expiresAt },
    });

    try {
      await this.email.sendPasswordResetEmail(user.email, user.name, rawToken);
    } catch (err) {
      this.logger.error('Failed to send password reset email', (err as Error).message);
    }

    return genericResponse;
  }

  // ──────────────────────────────────────────────────────────────────
  // Reset Password
  // ──────────────────────────────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: tokenHash, isDeleted: false },
    });

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        mustChangePassword: false,
        sessionId: null,
        refreshTokenHash: null,
      },
    });

    try {
      await this.auditLog.record({
        instituteId: user.instituteId,
        userId: user.id,
        action: 'PASSWORD_RESET',
        targetId: user.id,
        targetType: 'user',
      });
    } catch {}

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Change Password (authenticated)
  // ──────────────────────────────────────────────────────────────────
  async changePassword(userId: string, instituteId: string, dto: ChangePasswordDto) {
    const result = await this.legacyAuthService.changePassword(userId, dto);

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'PASSWORD_CHANGED',
        targetId: userId,
        targetType: 'user',
      });
    } catch {}

    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Me
  // ──────────────────────────────────────────────────────────────────
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, institute: { select: { id: true, name: true } } },
    });

    if (!user || user.isDeleted) throw new NotFoundException('User not found');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role.name,
      instituteId: user.instituteId,
      instituteName: user.institute.name,
      mustChangePassword: user.mustChangePassword,
      isEmailVerified: user.isEmailVerified,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
  }

  private isSupabaseProvisioningEnabled(): boolean {
    return (this.config.get<string>('SUPABASE_PROVISIONING_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  private isDualAuthEnabled(): boolean {
    return (this.config.get<string>('DUAL_AUTH_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  private isLoginTriggeredAuthMigrationEnabled(): boolean {
    return (
      (this.config.get<string>('LOGIN_TRIGGERED_AUTH_MIGRATION_ENABLED') ?? 'false').toLowerCase() ===
      'true'
    );
  }

  private tryParseLegacyRefreshToken(
    token: string,
  ): { sub?: string; session_id?: string; type?: string } | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = Buffer.from(this.toBase64(parts[1]), 'base64').toString('utf8');
      return JSON.parse(payload) as { sub?: string; session_id?: string; type?: string };
    } catch {
      return null;
    }
  }

  private toBase64(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    return `${base64}${padding}`;
  }

  private getSupabaseInviteRedirectUrl(): string {
    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    return `${frontendUrl}/auth/complete-invite`;
  }

  private async triggerLegacyUserMigration(
    user: {
      id: string;
      email: string;
      name: string;
      instituteId: string;
      authProvider: 'custom' | 'supabase';
      supabaseAuthId: string | null;
    },
    plaintextPassword: string,
  ): Promise<void> {
    if (!this.userAuthMigrationService) {
      this.logger.warn(
        `Login-triggered auth migration is enabled but UserAuthMigrationService is unavailable for user ${user.id}`,
      );
      return;
    }

    try {
      try {
        await this.auditLog.record({
          instituteId: user.instituteId,
          userId: user.id,
          action: 'USER_AUTH_MIGRATION_ATTEMPTED',
          targetId: user.id,
          targetType: 'user',
          newValues: {
            authProvider: user.authProvider,
            hasSupabaseAuthId: !!user.supabaseAuthId,
          },
        });
      } catch {}

      await this.userAuthMigrationService.migrateUserAfterLegacyLogin(user, plaintextPassword);
    } catch (error) {
      this.logger.warn(
        `Login-triggered auth migration failed for user ${user.id}: ${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }
}
