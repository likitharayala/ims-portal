import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto, ChangePasswordDto } from '../dto/auth.dto';
import { AuthenticatedRequestUser } from '../interfaces/authenticated-request-user.interface';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class LegacyAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateLogin(dto: LoginDto) {
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

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateLogin(dto);

    const sessionId = crypto.randomUUID();
    const tokens = await this.issueTokens(user.id, user.instituteId, user.role.name, sessionId);
    const refreshHash = this.hashToken(tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        sessionId,
        refreshTokenHash: refreshHash,
        lastLoginAt: new Date(),
      },
    });

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

    const incomingHash = this.hashToken(dto.refreshToken);
    if (user.refreshTokenHash !== incomingHash) {
      throw new UnauthorizedException('Refresh token has been rotated. Please log in again.');
    }

    const newSessionId = crypto.randomUUID();
    const tokens = await this.issueTokens(user.id, user.instituteId, user.role.name, newSessionId);
    const newRefreshHash = this.hashToken(tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { sessionId: newSessionId, refreshTokenHash: newRefreshHash },
    });

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!passwordMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    const newSessionId = crypto.randomUUID();
    const tokens = await this.issueTokens(user.id, user.instituteId, user.role.name, newSessionId);
    const newRefreshHash = this.hashToken(tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        sessionId: newSessionId,
        refreshTokenHash: newRefreshHash,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      message: 'Password changed successfully',
    };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedRequestUser> {
    let payload: {
      sub: string;
      institute_id: string;
      role: string;
      session_id: string;
    };

    try {
      payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return {
      sub: payload.sub,
      email: '',
      institute_id: payload.institute_id,
      role: payload.role,
      auth_provider: 'custom',
      session_id: payload.session_id,
    };
  }

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

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
