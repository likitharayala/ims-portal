import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Let passport-jwt verify signature + expiry
    const isValid = await super.canActivate(context);
    if (!isValid) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user as {
      sub: string;
      session_id: string;
      institute_id: string;
      role: string;
    };

    // Compare session_id in JWT with DB
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { sessionId: true, isDeleted: true, isActive: true },
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
}
