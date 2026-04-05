import { Injectable, Logger } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { STUDENT_EMAIL_STATUS } from './students.constants';

interface OnboardingAuditInput {
  instituteId: string;
  userId: string;
  studentId?: string;
  email?: string;
  studentClass?: string;
  school?: string;
}

@Injectable()
export class StudentOnboardingAuditService {
  private readonly logger = new Logger(StudentOnboardingAuditService.name);

  constructor(private readonly auditLog: AuditLogService) {}

  async logStudentCreated(input: OnboardingAuditInput): Promise<void> {
    await this.logAction({
      instituteId: input.instituteId,
      userId: input.userId,
      action: 'STUDENT_CREATED',
      targetId: input.studentId,
      targetType: 'student',
      newValues: {
        email: input.email,
        class: input.studentClass,
        school: input.school,
      },
    });
  }

  async logBulkCreated(
    instituteId: string,
    userId: string,
    summary: {
      created: number;
      skipped: number;
      queuedForEmail: number;
      emailQueueFailures: number;
    },
  ): Promise<void> {
    await this.logAction({
      instituteId,
      userId,
      action: 'STUDENT_BULK_CREATED',
      targetType: 'student',
      newValues: summary,
    });
  }

  async logEmailQueued(input: OnboardingAuditInput & { maxAttempts: number }): Promise<void> {
    await this.logAction({
      instituteId: input.instituteId,
      userId: input.userId,
      action: 'STUDENT_EMAIL_QUEUED',
      targetId: input.studentId,
      targetType: 'student',
      newValues: {
        emailStatus: STUDENT_EMAIL_STATUS.PENDING,
        maxAttempts: input.maxAttempts,
      },
    });
  }

  async logEmailSent(
    instituteId: string,
    userId: string,
    studentId: string,
    attemptsMade: number,
  ): Promise<void> {
    await this.logAction({
      instituteId,
      userId,
      action: 'STUDENT_EMAIL_SENT',
      targetId: studentId,
      targetType: 'student',
      newValues: {
        emailStatus: STUDENT_EMAIL_STATUS.SENT,
        attemptsMade,
      },
    });
  }

  async logEmailFailed(
    instituteId: string,
    userId: string,
    studentId: string,
    metadata: {
      reason: string;
      attemptsMade?: number;
      maxAttempts?: number;
      willRetry?: boolean;
    },
  ): Promise<void> {
    await this.logAction({
      instituteId,
      userId,
      action: 'STUDENT_EMAIL_FAILED',
      targetId: studentId,
      targetType: 'student',
      newValues: {
        emailStatus: STUDENT_EMAIL_STATUS.FAILED,
        ...metadata,
      },
    });
  }

  async logCredentialsResent(
    instituteId: string,
    userId: string,
    studentId: string,
  ): Promise<void> {
    await this.logAction({
      instituteId,
      userId,
      action: 'CREDENTIALS_RESENT',
      targetId: studentId,
      targetType: 'student',
      newValues: {
        emailStatus: STUDENT_EMAIL_STATUS.PENDING,
      },
    });
  }

  async logAction(data: {
    instituteId: string;
    userId: string;
    action: string;
    targetId?: string;
    targetType?: string;
    newValues?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.auditLog.record(data);
    } catch (error) {
      this.logger.warn(
        `Failed to record onboarding audit action=${data.action} instituteId=${data.instituteId} targetId=${data.targetId ?? 'n/a'}: ${(error as Error).message}`,
      );
    }
  }
}
