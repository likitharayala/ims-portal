import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationType } from '@prisma/client';

const PAGE_SIZE = 20;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── Shared helper ─────────────────────────────────────────────────────────

  private async getStudentRecord(instituteId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async listAdminNotifications(instituteId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where = { instituteId, isDeleted: false };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          _count: { select: { studentNotifications: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  async createNotification(
    instituteId: string,
    userId: string,
    dto: CreateNotificationDto,
  ) {
    if (dto.target === 'specific') {
      if (!dto.studentIds || dto.studentIds.length === 0) {
        throw new BadRequestException('studentIds required for target=specific');
      }
    }

    let studentIds: string[];
    if (dto.target === 'all') {
      const students = await this.prisma.student.findMany({
        where: { instituteId, isDeleted: false },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    } else {
      const students = await this.prisma.student.findMany({
        where: { id: { in: dto.studentIds }, instituteId, isDeleted: false },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    }

    const notification = await this.prisma.notification.create({
      data: {
        instituteId,
        title: dto.title,
        message: dto.message,
        type: dto.type ?? NotificationType.general,
        createdBy: userId,
        studentNotifications: {
          createMany: {
            data: studentIds.map((sid) => ({ studentId: sid })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        _count: { select: { studentNotifications: true } },
      },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'CREATE_NOTIFICATION',
        targetId: notification.id,
        targetType: 'notification',
        newValues: { title: dto.title, sentTo: studentIds.length },
      });
    } catch {}

    return { notification, sentTo: studentIds.length };
  }

  async deleteAllNotifications(instituteId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { instituteId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'DELETE_ALL_NOTIFICATIONS',
        targetType: 'notification',
        newValues: { deleted: result.count },
      });
    } catch {}

    return { deleted: result.count };
  }

  async deleteNotification(instituteId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, instituteId, isDeleted: false },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.notification.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'DELETE_NOTIFICATION',
        targetId: id,
        targetType: 'notification',
      });
    } catch {}

    return { deleted: true };
  }

  // ─── Student ───────────────────────────────────────────────────────────────

  async getStudentNotifications(instituteId: string, userId: string) {
    const student = await this.getStudentRecord(instituteId, userId);

    const rows = await this.prisma.studentNotification.findMany({
      where: {
        studentId: student.id,
        isDismissed: false,
        notification: { isDeleted: false },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        notification: {
          select: { id: true, title: true, message: true, type: true, createdAt: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      notificationId: r.notification.id,
      title: r.notification.title,
      message: r.notification.message,
      type: r.notification.type,
      notificationCreatedAt: r.notification.createdAt,
      isRead: r.isRead,
      isDismissed: r.isDismissed,
      readAt: r.readAt,
      createdAt: r.createdAt,
    }));
  }

  async getUnreadCount(instituteId: string, userId: string): Promise<number> {
    const student = await this.getStudentRecord(instituteId, userId);
    return this.prisma.studentNotification.count({
      where: {
        studentId: student.id,
        isRead: false,
        isDismissed: false,
        notification: { isDeleted: false },
      },
    });
  }

  async markRead(instituteId: string, userId: string, id: string) {
    const student = await this.getStudentRecord(instituteId, userId);
    const row = await this.prisma.studentNotification.findFirst({
      where: { id, studentId: student.id, notification: { isDeleted: false } },
    });
    if (!row) throw new NotFoundException('Notification not found');

    return this.prisma.studentNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async dismissNotification(instituteId: string, userId: string, id: string) {
    const student = await this.getStudentRecord(instituteId, userId);
    const row = await this.prisma.studentNotification.findFirst({
      where: { id, studentId: student.id, notification: { isDeleted: false } },
    });
    if (!row) throw new NotFoundException('Notification not found');

    return this.prisma.studentNotification.update({
      where: { id },
      data: {
        isDismissed: true,
        dismissedAt: new Date(),
        isRead: true,
        readAt: row.readAt ?? new Date(),
      },
    });
  }

  async dismissAll(instituteId: string, userId: string) {
    const student = await this.getStudentRecord(instituteId, userId);
    const result = await this.prisma.studentNotification.updateMany({
      where: {
        studentId: student.id,
        isDismissed: false,
        notification: { isDeleted: false },
      },
      data: { isDismissed: true, dismissedAt: new Date(), isRead: true },
    });
    return { dismissed: result.count };
  }
}
