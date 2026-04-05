import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { StudentOnboardingAuditService } from '../student-onboarding-audit.service';
import { StudentCredentialsService } from '../student-credentials.service';
import { StudentEmailSentEvent } from '../events/student-email-sent.event';
import {
  STUDENT_EMAIL_STATUS,
  STUDENT_EVENTS,
  STUDENT_ONBOARDING_QUEUE,
  STUDENT_ONBOARDING_SEND_CREDENTIALS_JOB,
} from '../students.constants';

export interface StudentOnboardingJobData {
  instituteId: string;
  studentId: string;
  initiatedByUserId: string;
}

@Processor(STUDENT_ONBOARDING_QUEUE)
export class StudentOnboardingProcessor {
  private readonly logger = new Logger(StudentOnboardingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingAudit: StudentOnboardingAuditService,
    private readonly emailService: EmailService,
    private readonly domainEvents: DomainEventsService,
    private readonly studentCredentials: StudentCredentialsService,
  ) {}

  @Process(STUDENT_ONBOARDING_SEND_CREDENTIALS_JOB)
  async handleSendCredentials(job: Job<StudentOnboardingJobData>): Promise<void> {
    const { instituteId, studentId, initiatedByUserId } = job.data;
    const currentAttempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        institute: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!student) {
      this.logger.warn(`Student ${studentId} not found for onboarding email job`);
      return;
    }

    const temporaryPassword = this.studentCredentials.generateTemporaryPassword();
    const passwordHash = await this.studentCredentials.hashPassword(temporaryPassword);

    try {
      if (job.attemptsMade > 0) {
        await this.prisma.student.update({
          where: { id: student.id },
          data: {
            emailSent: false,
            emailSentAt: null,
            emailStatus: STUDENT_EMAIL_STATUS.PENDING,
          },
        });
      }

      await this.prisma.user.update({
        where: { id: student.userId },
        data: {
          passwordHash,
          sessionId: this.studentCredentials.createSessionId(),
          mustChangePassword: true,
        },
      });

      await this.emailService.sendStudentOnboardingEmail({
        email: student.user.email,
        name: student.user.name,
        instituteName: student.institute.name,
        temporaryPassword,
      });

      await this.prisma.student.update({
        where: { id: student.id },
        data: {
          emailSent: true,
          emailSentAt: new Date(),
          emailStatus: STUDENT_EMAIL_STATUS.SENT,
        },
      });

      await this.onboardingAudit.logEmailSent(
        instituteId,
        initiatedByUserId,
        student.id,
        currentAttempt,
      );

      this.domainEvents.emit(
        STUDENT_EVENTS.EMAIL_SENT,
        new StudentEmailSentEvent(
          instituteId,
          student.id,
          student.user.email,
          initiatedByUserId,
          currentAttempt,
        ),
      );

      this.logger.log(
        `Student onboarding email sent for studentId=${student.id} instituteId=${instituteId} email=${student.user.email} attempt=${currentAttempt}`,
      );
    } catch (error) {
      const hasRemainingRetries = currentAttempt < maxAttempts;
      const lockedPasswordHash = await this.studentCredentials.createLockedPasswordHash();

      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: student.userId },
          data: {
            passwordHash: lockedPasswordHash,
            sessionId: this.studentCredentials.createSessionId(),
            mustChangePassword: true,
          },
        }),
        this.prisma.student.update({
          where: { id: student.id },
          data: {
            emailSent: false,
            emailSentAt: null,
            emailStatus: STUDENT_EMAIL_STATUS.FAILED,
            emailRetryCount: { increment: 1 },
          },
        }),
      ]);

      await this.onboardingAudit.logEmailFailed(instituteId, initiatedByUserId, student.id, {
        reason: (error as Error).message,
        attemptsMade: currentAttempt,
        maxAttempts,
        willRetry: hasRemainingRetries,
      });

      this.logger.error(
        `Failed to send onboarding email for studentId=${student.id} instituteId=${instituteId} email=${student.user.email} attempt=${currentAttempt}/${maxAttempts}: ${(error as Error).message}`,
      );

      throw error;
    }
  }
}
