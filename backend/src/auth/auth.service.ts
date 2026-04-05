import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly email: EmailService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Signup
  // ──────────────────────────────────────────────────────────────────
  async signup(dto: SignupDto) {
    // Check uniqueness
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, isDeleted: false },
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

    // Generate email verification token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Resolve feature IDs
    const featureRecords = await this.prisma.feature.findMany({
      where: { name: { in: dto.features } },
    });

    // Admin role id = 1
    const adminRole = await this.prisma.role.findFirst({ where: { name: 'admin' } });
    if (!adminRole) throw new Error('Admin role not seeded');

    // Create institute + user in a transaction
    const { institute, user } = await this.prisma.$transaction(async (tx) => {
      const institute = await tx.institute.create({
        data: { name: dto.instituteName, email: dto.email, phone: dto.phone, slug },
      });

      const user = await tx.user.create({
        data: {
          instituteId: institute.id,
          roleId: adminRole.id,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          emailVerificationToken: tokenHash,
          emailVerificationExpiresAt: expiresAt,
          isEmailVerified: false,
        },
      });

      // Create institute features
      await tx.instituteFeature.createMany({
        data: featureRecords.map((f) => ({
          instituteId: institute.id,
          featureId: f.id,
          isEnabled: true,
        })),
      });

      return { institute, user };
    });

    // Send verification email (non-blocking failure)
    try {
      await this.email.sendVerificationEmail(user.email, user.name, rawToken);
    } catch (err) {
      this.logger.error('Failed to send verification email', (err as Error).message);
    }

    try {
      await this.auditLog.record({
        instituteId: institute.id,
        userId: user.id,
        action: 'SIGNUP',
        targetId: user.id,
        targetType: 'user',
      });
    } catch {}

    return { message: 'Account created. Please verify your email to continue.' };
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
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }],
        isDeleted: false,
      },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    // Admin must verify email; students don't need to
    if (user.role.name === 'admin' && !user.isEmailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in',
      });
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate new session
    const sessionId = crypto.randomUUID();
    const tokens = await this.issueTokens(user.id, user.instituteId, user.role.name, sessionId);
    const refreshHash = crypto
      .createHash('sha256')
      .update(tokens.refreshToken)
      .digest('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        sessionId,
        refreshTokenHash: refreshHash,
        lastLoginAt: new Date(),
      },
    });

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

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
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
  // Logout
  // ──────────────────────────────────────────────────────────────────
  async logout(userId: string, instituteId: string) {
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
    let payload: { sub: string; session_id: string; type: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || user.isDeleted || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    if (user.sessionId !== payload.session_id) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALIDATED',
        message: 'Session expired. Please log in again.',
      });
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');

    if (user.refreshTokenHash !== incomingHash) {
      throw new UnauthorizedException('Refresh token has been rotated. Please log in again.');
    }

    // Rotate tokens
    const newSessionId = crypto.randomUUID();
    const tokens = await this.issueTokens(user.id, user.instituteId, user.role.name, newSessionId);
    const newRefreshHash = crypto
      .createHash('sha256')
      .update(tokens.refreshToken)
      .digest('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { sessionId: newSessionId, refreshTokenHash: newRefreshHash },
    });

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const passwordMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!passwordMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    const newSessionId = crypto.randomUUID();
    const tokens = await this.issueTokens(user.id, user.instituteId, user.role.name, newSessionId);
    const newRefreshHash = crypto
      .createHash('sha256')
      .update(tokens.refreshToken)
      .digest('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        sessionId: newSessionId,
        refreshTokenHash: newRefreshHash,
      },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'PASSWORD_CHANGED',
        targetId: userId,
        targetType: 'user',
      });
    } catch {}

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      message: 'Password changed successfully',
    };
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
  private async issueTokens(
    userId: string,
    instituteId: string,
    role: string,
    sessionId: string,
  ) {
    const payload = { sub: userId, institute_id: instituteId, role, session_id: sessionId };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRY') ?? '15m') as any,
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, session_id: sessionId, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '7d') as any,
      },
    );

    return { accessToken, refreshToken };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
  }
}
