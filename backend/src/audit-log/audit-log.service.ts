import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogRecord {
  instituteId: string;
  userId: string;
  action: string;
  targetId?: string;
  targetType?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: AuditLogRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        instituteId: data.instituteId,
        userId: data.userId,
        action: data.action,
        targetId: data.targetId,
        targetType: data.targetType,
        oldValues: data.oldValues as any,
        newValues: data.newValues as any,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }
}
