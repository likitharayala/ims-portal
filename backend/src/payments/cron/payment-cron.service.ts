import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PaymentCronService implements OnModuleInit {
  private readonly logger = new Logger(PaymentCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run on startup, then every 24 hours
    void this.tick();
    setInterval(() => void this.tick(), ONE_DAY_MS);
  }

  private async tick() {
    await this.generateMonthlyPayments();
    await this.markOverdue();
  }

  // ─── Generate payment records for all active students (current month) ─
  async generateMonthlyPayments() {
    try {
      const now = new Date();
      const month = now.getMonth() + 1; // 1-indexed
      const year = now.getFullYear();

      const students = await this.prisma.student.findMany({
        where: { isDeleted: false },
        select: { id: true, instituteId: true, feeAmount: true },
      });

      if (students.length === 0) return;

      const result = await this.prisma.payment.createMany({
        data: students.map((s) => ({
          instituteId: s.instituteId,
          studentId: s.id,
          month,
          year,
          amount: s.feeAmount,
          status: PaymentStatus.pending,
        })),
        skipDuplicates: true,
      });

      if (result.count > 0) {
        this.logger.log(
          `Generated ${result.count} payment records for ${month}/${year}`,
        );
      }
    } catch (err) {
      this.logger.error('Error generating monthly payments', err);
    }
  }

  // ─── Mark pending payments overdue (5 days after month end) ──────────
  async markOverdue() {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed

      // Build OR conditions for past months where threshold has passed
      // Threshold for month M / year Y: new Date(Y, M, 6) [JS: month 0-indexed → M is next month]
      // e.g. January (M=1, Y=2025): new Date(2025, 1, 6) = Feb 6, 2025
      const overdueConditions: { month: number; year: number }[] = [];

      for (let y = currentYear - 2; y <= currentYear; y++) {
        for (let m = 1; m <= 12; m++) {
          if (y === currentYear && m >= currentMonth) break;
          const threshold = new Date(y, m, 6); // m is 0-indexed next month
          if (now >= threshold) {
            overdueConditions.push({ month: m, year: y });
          }
        }
      }

      if (overdueConditions.length === 0) return;

      const result = await this.prisma.payment.updateMany({
        where: {
          status: PaymentStatus.pending,
          OR: overdueConditions,
        },
        data: { status: PaymentStatus.overdue },
      });

      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} payments as overdue`);
      }
    } catch (err) {
      this.logger.error('Error marking overdue payments', err);
    }
  }
}
