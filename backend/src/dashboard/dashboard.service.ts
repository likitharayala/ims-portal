import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminStats(instituteId: string) {
    const [
      totalStudents,
      pendingPayments,
      activeAssessments,
      totalMaterials,
    ] = await Promise.all([
      // Total active students
      this.prisma.student.count({
        where: { instituteId, isDeleted: false },
      }),

      // Pending + overdue payments (count + total amount)
      this.prisma.payment.aggregate({
        where: {
          instituteId,
          status: { in: ['pending', 'overdue'] },
          student: { isDeleted: false },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),

      // Published + active assessments
      this.prisma.assessment.count({
        where: {
          instituteId,
          isDeleted: false,
          status: { in: ['published', 'active'] },
        },
      }),

      // Study materials (not hidden, not deleted)
      this.prisma.studyMaterial.count({
        where: { instituteId, isDeleted: false, isHidden: false },
      }),
    ]);

    return {
      totalStudents,
      pendingPayments: {
        count: pendingPayments._count.id,
        totalAmount: Number(pendingPayments._sum.amount ?? 0),
      },
      activeAssessments,
      totalMaterials,
    };
  }

  async getStudentDashboard(instituteId: string, userId: string) {
    // Get student record
    const student = await this.prisma.student.findFirst({
      where: { userId, isDeleted: false },
      select: { id: true },
    });

    const studentId = student?.id ?? '';

    const [upcomingAssessments, unreadNotifications, recentMaterials] =
      await Promise.all([
        // All published + active assessments
        this.prisma.assessment.findMany({
          where: {
            instituteId,
            isDeleted: false,
            status: { in: ['published', 'active'] },
          },
          select: {
            id: true,
            title: true,
            subject: true,
            instructions: true,
            status: true,
            startAt: true,
            endAt: true,
            totalMarks: true,
          },
          orderBy: { startAt: 'asc' },
        }),

        // Unread + not dismissed notifications
        studentId
          ? this.prisma.studentNotification.count({
              where: {
                studentId,
                isRead: false,
                isDismissed: false,
                notification: { isDeleted: false },
              },
            })
          : Promise.resolve(0),

        // Recent 5 materials
        this.prisma.studyMaterial.findMany({
          where: { instituteId, isDeleted: false, isHidden: false },
          select: {
            id: true,
            title: true,
            subject: true,
            author: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    return {
      upcomingAssessments,
      unreadNotifications,
      recentMaterials,
    };
  }
}
