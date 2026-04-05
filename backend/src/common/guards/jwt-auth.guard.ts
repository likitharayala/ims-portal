import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from '../decorators/allow-during-password-change.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthIdentityService } from '../../auth/services/auth-identity.service';
import { AuthConfigService } from '../../auth/services/auth-config.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly authIdentityService: AuthIdentityService,
    private readonly authConfig: AuthConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowDuringPasswordChange = this.reflector.getAllAndOverride<boolean>(
      ALLOW_DURING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();

    if (!this.authConfig.isDualAuthEnabled()) {
      // Let passport-jwt verify signature + expiry
      const isValid = await super.canActivate(context);
      if (!isValid) return false;
    } else {
      const token = this.extractBearerToken(request);
      if (!token) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      this.logger.debug('Using dual-auth delegation path in JwtAuthGuard');
      request.user = await this.authIdentityService.authenticateBearerToken(token);
    }

    const user = request.user as {
      sub: string;
      session_id: string;
      institute_id: string;
      role: string;
    };

    // Compare session_id in JWT with DB
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        sessionId: true,
        isDeleted: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (!dbUser || dbUser.isDeleted || !dbUser.isActive) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found or inactive',
      });
    }

    if (dbUser.sessionId !== user.session_id) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALIDATED',
        message: 'Session expired. Please log in again.',
      });
    }

    if (dbUser.mustChangePassword && !allowDuringPasswordChange) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing.',
      });
    }

    return true;
  }

  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        })
      );
    }
    return user;
  }

  private extractBearerToken(request: {
    headers?: { authorization?: string | string[] };
  }): string | null {
    const authorization = request.headers?.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!value) {
      return null;
    }

    const [type, token] = value.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
