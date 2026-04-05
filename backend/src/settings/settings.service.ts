import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── Institute ────────────────────────────────────────────────────────
  async getInstitute(instituteId: string) {
    const institute = await this.prisma.institute.findFirst({
      where: { id: instituteId, isActive: true },
      select: { id: true, name: true, email: true, phone: true, slug: true, createdAt: true },
    });
    if (!institute) throw new NotFoundException('Institute not found');
    return institute;
  }

  async updateInstitute(instituteId: string, userId: string, dto: UpdateInstituteDto) {
    const institute = await this.prisma.institute.findFirst({
      where: { id: instituteId, isActive: true },
    });
    if (!institute) throw new NotFoundException('Institute not found');

    const updated = await this.prisma.institute.update({
      where: { id: instituteId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
      select: { id: true, name: true, email: true, phone: true, slug: true },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_INSTITUTE_SETTINGS',
        targetId: instituteId,
        targetType: 'institute',
        newValues: dto as Record<string, unknown>,
      });
    } catch {}

    return updated;
  }

  // ─── Features ─────────────────────────────────────────────────────────
  async getFeatures(instituteId: string) {
    const features = await this.prisma.instituteFeature.findMany({
      where: { instituteId },
      include: { feature: { select: { name: true } } },
    });

    const featureMap: Record<string, boolean> = {};
    for (const f of features) {
      featureMap[f.feature.name] = f.isEnabled;
    }
    return featureMap;
  }

  async updateFeatures(instituteId: string, userId: string, dto: UpdateFeaturesDto) {
    const featureNames = Object.keys(dto.features) as string[];

    // Find all feature records to get IDs
    const featureRecords = await this.prisma.feature.findMany({
      where: { name: { in: featureNames } },
    });

    await Promise.all(
      featureRecords.map((f) => {
        const isEnabled = (dto.features as Record<string, boolean | undefined>)[f.name];
        if (isEnabled === undefined) return Promise.resolve();
        return this.prisma.instituteFeature.updateMany({
          where: { instituteId, featureId: f.id },
          data: { isEnabled },
        });
      }),
    );

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_FEATURES',
        newValues: dto.features as Record<string, unknown>,
      });
    } catch {}

    return this.getFeatures(instituteId);
  }

  // ─── Admin profile ────────────────────────────────────────────────────
  async getAdminProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateAdminProfile(userId: string, instituteId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_ADMIN_PROFILE',
        newValues: dto as Record<string, unknown>,
      });
    } catch {}

    return updated;
  }
}
