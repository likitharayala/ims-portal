import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AssessmentStatus, SubmissionStatus, NotificationType } from '@prisma/client';

@Injectable()
export class AssessmentCronService implements OnModuleInit {
  private readonly logger = new Logger(AssessmentCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    // Run immediately, then every 60 seconds
    void this.handleTransitions();
    setInterval(() => void this.handleTransitions(), 60_000);
  }

  async handleTransitions() {
    const now = new Date();

    try {
      // published → active (when startAt <= now)
      // Find them first so we can send notifications
      const activating = await this.prisma.assessment.findMany({
        where: {
          status: AssessmentStatus.published,
          startAt: { lte: now },
          isDeleted: false,
        },
        select: { id: true, instituteId: true, title: true, subject: true, endAt: true, createdBy: true },
      });

      if (activating.length > 0) {
        await this.prisma.assessment.updateMany({
          where: { id: { in: activating.map((a) => a.id) } },
          data: { status: AssessmentStatus.active },
        });

        // Send a notification for each activated assessment
        for (const a of activating) {
          try {
            const subjectPart = a.subject ? ` (${a.subject})` : '';
            const endPart = a.endAt
              ? ` — ends ${new Date(a.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
              : '';
            await this.notificationsService.createNotification(
              a.instituteId,
              a.createdBy,
              {
                title: `Assessment Now Live: ${a.title}`.slice(0, 100),
                message: `Your assessment "${a.title}"${subjectPart} is now open${endPart}. Open the Assessments section to begin.`.slice(0, 500),
                type: NotificationType.assessment_reminder,
                target: 'all',
              },
            );
          } catch (notifErr) {
            this.logger.warn(`Failed to send activation notification for assessment ${a.id}`, notifErr);
          }
        }
      }

      // active → closed (when endAt <= now)
      const closingAssessments = await this.prisma.assessment.findMany({
        where: {
          status: AssessmentStatus.active,
          endAt: { lte: now },
          isDeleted: false,
        },
        select: { id: true, instituteId: true },
      });

      for (const assessment of closingAssessments) {
        await this.closeAssessment(assessment.id, assessment.instituteId);
      }
    } catch (err) {
      this.logger.error('Assessment cron error', err);
    }
  }

  private async closeAssessment(assessmentId: string, instituteId: string) {
    // Auto-submit all in-progress submissions
    await this.prisma.submission.updateMany({
      where: {
        assessmentId,
        instituteId,
        status: SubmissionStatus.in_progress,
      },
      data: {
        status: SubmissionStatus.submitted,
        autoSubmitted: true,
        submittedAt: new Date(),
      },
    });

    // Mark absent: find students who never started the exam
    // Get all active students in the institute
    const activeStudents = await this.prisma.student.findMany({
      where: { instituteId, isDeleted: false },
      select: { id: true },
    });

    const existingSubmissions = await this.prisma.submission.findMany({
      where: { assessmentId },
      select: { studentId: true },
    });

    const submittedStudentIds = new Set(existingSubmissions.map((s) => s.studentId));

    const absentStudents = activeStudents.filter(
      (s) => !submittedStudentIds.has(s.id),
    );

    if (absentStudents.length > 0) {
      await this.prisma.submission.createMany({
        data: absentStudents.map((s) => ({
          assessmentId,
          studentId: s.id,
          instituteId,
          status: SubmissionStatus.absent,
          totalMarks: 0,
          isFinalized: true,
        })),
        skipDuplicates: true,
      });
    }

    // Close the assessment
    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: AssessmentStatus.closed },
    });

    this.logger.log(`Assessment ${assessmentId} closed and auto-submitted`);
  }
}
