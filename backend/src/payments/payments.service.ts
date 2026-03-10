import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { BulkFeeUpdateDto } from './dto/bulk-fee-update.dto';
import { SendReminderDto } from './dto/send-reminder.dto';
import { PaymentStatus, NotificationType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const PAGE_SIZE = 20;

const MONTHS = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const paymentSelect = {
  id: true,
  month: true,
  year: true,
  amount: true,
  status: true,
  paidAt: true,
  notes: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      class: true,
      isDeleted: true,
      user: { select: { name: true } },
    },
  },
} as const;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── Build visibility WHERE (hide paid records from deleted students) ──
  private buildVisibilityWhere(
    instituteId: string,
    query: ListPaymentsQueryDto,
    forceStatus?: PaymentStatus,
  ) {
    const status = forceStatus ?? (query.status as PaymentStatus | undefined);

    const where: any = {
      instituteId,
      ...(query.month && { month: query.month }),
      ...(query.year && { year: query.year }),
      ...(status && { status }),
      // IDOR + deleted-student visibility rule
      OR: [
        { student: { isDeleted: false, ...(query.class && { class: query.class }) } },
        {
          student: { isDeleted: true, ...(query.class && { class: query.class }) },
          status: { in: [PaymentStatus.pending, PaymentStatus.overdue] },
        },
      ],
    };

    return where;
  }

  // ─── List payments ────────────────────────────────────────────────────
  async listPayments(instituteId: string, query: ListPaymentsQueryDto) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;
    const where = this.buildVisibilityWhere(instituteId, query);

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { student: { user: { name: 'asc' } } }],
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─── List overdue payments (all months) ───────────────────────────────
  async listOverduePayments(instituteId: string, query: ListPaymentsQueryDto) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;
    const where = this.buildVisibilityWhere(
      instituteId,
      { ...query, month: undefined, year: undefined, status: undefined },
      PaymentStatus.overdue,
    );

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { student: { user: { name: 'asc' } } }],
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─── Filter options ───────────────────────────────────────────────────
  async getFilterOptions(instituteId: string) {
    const [monthYearRows, classRows] = await Promise.all([
      this.prisma.payment.findMany({
        where: { instituteId },
        select: { month: true, year: true },
        distinct: ['month', 'year'],
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      this.prisma.student.findMany({
        where: { instituteId, isDeleted: false },
        select: { class: true },
        distinct: ['class'],
        orderBy: { class: 'asc' },
      }),
    ]);

    return {
      monthYears: monthYearRows.map((r) => ({ month: r.month, year: r.year })),
      classes: classRows.map((r) => r.class),
    };
  }

  // ─── Update payment status ────────────────────────────────────────────
  async updatePaymentStatus(
    instituteId: string,
    userId: string,
    paymentId: string,
    dto: UpdatePaymentStatusDto,
  ) {
    const existing = await this.prisma.payment.findFirst({
      where: { id: paymentId, instituteId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Payment not found');

    const newStatus = dto.status as PaymentStatus;

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        paidAt: newStatus === PaymentStatus.paid ? new Date() : null,
        notes: dto.notes,
        updatedBy: userId,
      },
      select: paymentSelect,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_PAYMENT_STATUS',
        targetId: paymentId,
        targetType: 'payment',
        oldValues: { status: existing.status },
        newValues: { status: newStatus },
      });
    } catch {}

    return updated;
  }

  // ─── Bulk fee update (apply from next month via student feeAmount) ────
  async bulkUpdateFee(
    instituteId: string,
    userId: string,
    dto: BulkFeeUpdateDto,
  ) {
    const count = await this.prisma.student.count({
      where: { instituteId, class: dto.class, isDeleted: false },
    });
    if (count === 0) {
      throw new BadRequestException(
        `No active students found in class "${dto.class}"`,
      );
    }

    await this.prisma.student.updateMany({
      where: { instituteId, class: dto.class, isDeleted: false },
      data: { feeAmount: dto.feeAmount },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'BULK_UPDATE_FEE',
        targetType: 'student',
        newValues: { class: dto.class, feeAmount: dto.feeAmount },
      });
    } catch {}

    return { updated: count };
  }

  // ─── Send payment reminder notification ───────────────────────────────
  async sendReminder(
    instituteId: string,
    userId: string,
    dto: SendReminderDto,
  ) {
    // Resolve target student IDs
    let studentIds: string[] = [];

    if (dto.target === 'all') {
      const students = await this.prisma.student.findMany({
        where: { instituteId, isDeleted: false },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    } else if (dto.target === 'pending_overdue') {
      const payments = await this.prisma.payment.findMany({
        where: {
          instituteId,
          status: { in: [PaymentStatus.pending, PaymentStatus.overdue] },
          student: { isDeleted: false },
        },
        select: { studentId: true },
        distinct: ['studentId'],
      });
      studentIds = payments.map((p) => p.studentId);
    } else if (dto.target === 'specific') {
      if (!dto.studentIds || dto.studentIds.length === 0) {
        throw new BadRequestException(
          'studentIds required when target is "specific"',
        );
      }
      // Validate all students belong to this institute
      const valid = await this.prisma.student.findMany({
        where: {
          id: { in: dto.studentIds },
          instituteId,
          isDeleted: false,
        },
        select: { id: true },
      });
      studentIds = valid.map((s) => s.id);
    }

    if (studentIds.length === 0) {
      return { notificationId: null, sentTo: 0 };
    }

    // Create notification
    const notification = await this.prisma.notification.create({
      data: {
        instituteId,
        title: dto.title,
        message: dto.message,
        type: NotificationType.payment_reminder,
        createdBy: userId,
      },
    });

    // Fan out to students
    await this.prisma.studentNotification.createMany({
      data: studentIds.map((sid) => ({
        notificationId: notification.id,
        studentId: sid,
      })),
      skipDuplicates: true,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'SEND_PAYMENT_REMINDER',
        targetId: notification.id,
        targetType: 'notification',
        newValues: { target: dto.target, sentTo: studentIds.length },
      });
    } catch {}

    return { notificationId: notification.id, sentTo: studentIds.length };
  }

  // ─── Export to Excel ──────────────────────────────────────────────────
  async exportPayments(
    instituteId: string,
    query: ListPaymentsQueryDto,
  ): Promise<Buffer> {
    const where = this.buildVisibilityWhere(instituteId, query);

    const payments = await this.prisma.payment.findMany({
      where,
      select: paymentSelect,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { student: { user: { name: 'asc' } } }],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Payments');

    sheet.columns = [
      { header: 'Student Name', key: 'name', width: 25 },
      { header: 'Class', key: 'class', width: 15 },
      { header: 'Month', key: 'month', width: 15 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Amount (₹)', key: 'amount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Paid At', key: 'paidAt', width: 22 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];

    // Header style
    sheet.getRow(1).font = { bold: true };

    for (const p of payments) {
      sheet.addRow({
        name: p.student.user.name,
        class: p.student.class,
        month: MONTHS[p.month] ?? p.month,
        year: p.year,
        amount: Number(p.amount),
        status: p.status,
        paidAt: p.paidAt ? new Date(p.paidAt).toLocaleString('en-IN') : '',
        notes: p.notes ?? '',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Create payment for a single new student (called from StudentsService) ─
  async createPaymentForStudent(
    instituteId: string,
    studentId: string,
    feeAmount: Prisma.Decimal,
  ) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    await this.prisma.payment.create({
      data: {
        instituteId,
        studentId,
        month,
        year,
        amount: feeAmount,
        status: PaymentStatus.pending,
      },
    });
  }

  // ─── Payment stats summary ────────────────────────────────────────────
  async getStats(instituteId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [pendingCount, overdueCount, pendingSum, overdueSum] =
      await Promise.all([
        this.prisma.payment.count({
          where: {
            instituteId,
            status: PaymentStatus.pending,
            student: { isDeleted: false },
          },
        }),
        this.prisma.payment.count({
          where: {
            instituteId,
            status: PaymentStatus.overdue,
          },
        }),
        this.prisma.payment.aggregate({
          where: {
            instituteId,
            status: PaymentStatus.pending,
            student: { isDeleted: false },
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            instituteId,
            status: PaymentStatus.overdue,
          },
          _sum: { amount: true },
        }),
      ]);

    return {
      pendingCount,
      overdueCount,
      pendingAmount: Number(pendingSum._sum.amount ?? 0),
      overdueAmount: Number(overdueSum._sum.amount ?? 0),
    };
  }
}
