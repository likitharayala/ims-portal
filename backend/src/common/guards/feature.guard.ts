import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY, Feature } from '../decorators/feature.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredFeature = this.reflector.getAllAndOverride<Feature>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { institute_id: string };

    const instituteFeature = await this.prisma.instituteFeature.findFirst({
      where: {
        instituteId: user.institute_id,
        feature: { name: requiredFeature },
      },
      select: { isEnabled: true },
    });

    if (!instituteFeature || !instituteFeature.isEnabled) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: 'This feature is not available for your institute',
      });
    }

    return true;
  }
}
