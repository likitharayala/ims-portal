import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { DomainEventsService } from '../common/events/domain-events.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentOnboardingAuditService } from './student-onboarding-audit.service';
import { StudentCredentialsService } from './student-credentials.service';
import { UserProvisioningService } from '../users/services/user-provisioning.service';
import { StudentCreatedEvent } from './events/student-created.event';
import { StudentEmailQueuedEvent } from './events/student-email-queued.event';
import { StudentEmailSentEvent } from './events/student-email-sent.event';
import {
  STUDENT_ONBOARDING_SEND_CREDENTIALS_ATTEMPTS,
  STUDENT_ONBOARDING_SEND_CREDENTIALS_BACKOFF_MS,
  STUDENT_EMAIL_STATUS,
  STUDENT_EVENTS,
  STUDENT_ONBOARDING_QUEUE,
  STUDENT_ONBOARDING_SEND_CREDENTIALS_JOB,
} from './students.constants';

const studentSelect = {
  id: true,
  rollNumber: true,
  class: true,
  school: true,
  dateOfBirth: true,
  address: true,
  parentName: true,
  parentPhone: true,
  feeAmount: true,
  joinedDate: true,
  emailSent: true,
  emailSentAt: true,
  emailStatus: true,
  emailRetryCount: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      mustChangePassword: true,
      isEmailVerified: true,
      isActive: true,
      lastLoginAt: true,
    },
  },
} as const;

interface QueueCredentialsResult {
  emailStatus: string;
}

interface ProvisionStudentOptions {
  studentRoleId?: number;
  skipExistingEmailCheck?: boolean;
}

@Injectable()
export class StudentOnboardingService {
  private readonly logger = new Logger(StudentOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly onboardingAudit: StudentOnboardingAuditService,
    private readonly paymentsService: PaymentsService,
    private readonly domainEvents: DomainEventsService,
    private readonly studentCredentials: StudentCredentialsService,
    private readonly userProvisioning: UserProvisioningService,
    @InjectQueue(STUDENT_ONBOARDING_QUEUE)
    private readonly onboardingQueue: Queue,
  ) {}

  async createStudentAndQueueCredentials(
    instituteId: string,
    userId: string,
    dto: CreateStudentDto,
  ) {
    const student = await this.createStudentRecord(instituteId, dto);
    const supabaseProvisioningEnabled = this.isSupabaseProvisioningEnabled();

    await this.onboardingAudit.logStudentCreated({
      instituteId,
      userId,
      studentId: student.id,
      email: dto.email,
      studentClass: dto.class,
      school: dto.school,
    });

    this.domainEvents.emit(
      STUDENT_EVENTS.CREATED,
      new StudentCreatedEvent(instituteId, student.id, dto.email, userId),
    );

    if (supabaseProvisioningEnabled) {
      await this.onboardingAudit.logEmailSent(instituteId, userId, student.id, 1);

      this.domainEvents.emit(
        STUDENT_EVENTS.EMAIL_SENT,
        new StudentEmailSentEvent(instituteId, student.id, dto.email, userId, 1),
      );

      return {
        student,
        emailStatus: student.emailStatus,
        message:
          "Student created successfully. Invite email was sent to the student's email address.",
      };
    }

    const queueResult = await this.queueCredentialsEmail(instituteId, userId, student.id, dto.email);

    return {
      student: {
        ...student,
        emailSent: queueResult.emailStatus === STUDENT_EMAIL_STATUS.SENT,
        emailSentAt: null,
        emailStatus: queueResult.emailStatus,
      },
      emailStatus: queueResult.emailStatus,
      message:
        queueResult.emailStatus === STUDENT_EMAIL_STATUS.FAILED
          ? 'Student created successfully, but credential delivery could not be queued. Please retry from the student list after email service is restored.'
          : "Student created successfully. Credentials will be sent to the student's email shortly.",
    };
  }

  async createStudentFromBulkUpload(
    instituteId: string,
    userId: string,
    dto: CreateStudentDto,
    options: ProvisionStudentOptions = {},
  ): Promise<QueueCredentialsResult> {
    const student = await this.createStudentRecord(instituteId, dto, options);

    if (this.isSupabaseProvisioningEnabled()) {
      return { emailStatus: student.emailStatus };
    }

    const queueResult = await this.queueCredentialsEmail(instituteId, userId, student.id, dto.email);

    return { emailStatus: queueResult.emailStatus };
  }

  async resendCredentials(instituteId: string, userId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            email: true,
            authProvider: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (this.isSupabaseProvisioningEnabled() && student.user.authProvider === 'supabase') {
      throw new ConflictException(
        'This student uses Supabase invite-based onboarding. Legacy credential resend is disabled.',
      );
    }

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
          emailStatus: STUDENT_EMAIL_STATUS.PENDING,
          emailRetryCount: 0,
        },
      }),
    ]);

    await this.onboardingAudit.logCredentialsResent(instituteId, userId, student.id);

    const queueResult = await this.queueCredentialsEmail(
      instituteId,
      userId,
      student.id,
      student.user.email,
    );

    return {
      studentId: student.id,
      emailStatus: queueResult.emailStatus,
      message:
        queueResult.emailStatus === STUDENT_EMAIL_STATUS.FAILED
          ? 'Previous credentials were invalidated, but the new credential email could not be queued. Please retry once email service is available.'
          : 'New credentials will be sent to the student email shortly.',
    };
  }

  private async createStudentRecord(
    instituteId: string,
    dto: CreateStudentDto,
    options: ProvisionStudentOptions = {},
  ) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    if (!options.skipExistingEmailCheck) {
      const existing = await this.prisma.user.findFirst({
        where: { email: normalizedEmail, isDeleted: false },
      });
      if (existing) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const studentRoleId = await this.getStudentRoleId(options.studentRoleId);

    const provisioningResult = this.isSupabaseProvisioningEnabled()
      ? await this.createSupabaseStudentRecord(
          instituteId,
          studentRoleId,
          dto,
          normalizedEmail,
        )
      : await this.createLegacyStudentRecord(instituteId, studentRoleId, dto, normalizedEmail);

    if (provisioningResult.status !== 'created' || !provisioningResult.payload) {
      throw new ConflictException('A user with this email already exists');
    }

    const student = provisioningResult.payload;

    try {
      await this.paymentsService.createPaymentForStudent(
        instituteId,
        student.id,
        student.feeAmount as any,
      );
    } catch {}

    return student;
  }

  private async createSupabaseStudentRecord(
    instituteId: string,
    studentRoleId: number,
    dto: CreateStudentDto,
    normalizedEmail: string,
  ) {
    const lockedPasswordHash = await this.studentCredentials.createLockedPasswordHash();
    const invitedAt = new Date();

    return this.userProvisioning.provisionInvitedUser({
      action: 'student_provision',
      email: normalizedEmail,
      instituteId,
      redirectTo: this.getSupabaseInviteRedirectUrl(),
      metadata: {
        instituteId,
        role: 'student',
      },
      writeLocal: async (tx, authUser, email) => {
        const user = await tx.user.create({
          data: {
            id: authUser.id,
            instituteId,
            roleId: studentRoleId,
            name: dto.name,
            email,
            phone: dto.phone,
            authProvider: 'supabase',
            authMigratedAt: null,
            passwordHash: lockedPasswordHash,
            mustChangePassword: false,
            isEmailVerified: false,
          } as any,
        });

        const student = await tx.student.create({
          data: {
            instituteId,
            userId: user.id,
            rollNumber: dto.rollNumber,
            class: dto.class,
            school: dto.school,
            feeAmount: dto.feeAmount,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            address: dto.address,
            parentName: dto.parentName,
            parentPhone: dto.parentPhone,
            joinedDate: dto.joinedDate ? new Date(dto.joinedDate) : new Date(),
            emailSent: true,
            emailSentAt: invitedAt,
            emailStatus: STUDENT_EMAIL_STATUS.SENT,
            emailRetryCount: 0,
          },
          select: studentSelect,
        });

        return { appUser: user, payload: student };
      },
    });
  }

  private async createLegacyStudentRecord(
    instituteId: string,
    studentRoleId: number,
    dto: CreateStudentDto,
    normalizedEmail: string,
  ) {
    const lockedPasswordHash = await this.studentCredentials.createLockedPasswordHash();
    const sessionId = this.studentCredentials.createSessionId();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          instituteId,
          roleId: studentRoleId,
          name: dto.name,
          email: normalizedEmail,
          phone: dto.phone,
          authProvider: 'custom',
          authMigratedAt: null,
          passwordHash: lockedPasswordHash,
          sessionId,
          mustChangePassword: true,
          isEmailVerified: true,
        } as any,
      });

      const student = await tx.student.create({
        data: {
          instituteId,
          userId: user.id,
          rollNumber: dto.rollNumber,
          class: dto.class,
          school: dto.school,
          feeAmount: dto.feeAmount,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          address: dto.address,
          parentName: dto.parentName,
          parentPhone: dto.parentPhone,
          joinedDate: dto.joinedDate ? new Date(dto.joinedDate) : new Date(),
          emailSent: false,
          emailStatus: STUDENT_EMAIL_STATUS.PENDING,
          emailRetryCount: 0,
        },
        select: studentSelect,
      });

      return { status: 'created' as const, userId: user.id, payload: student };
    });
  }

  private async getStudentRoleId(preloadedRoleId?: number): Promise<number> {
    if (preloadedRoleId) {
      return preloadedRoleId;
    }

    const studentRole = await this.prisma.role.findFirst({ where: { name: 'student' } });
    if (!studentRole) {
      throw new InternalServerErrorException('Student role not seeded');
    }

    return studentRole.id;
  }

  private async queueCredentialsEmail(
    instituteId: string,
    userId: string,
    studentId: string,
    email: string,
  ): Promise<QueueCredentialsResult> {
    try {
      await this.onboardingQueue.add(
        STUDENT_ONBOARDING_SEND_CREDENTIALS_JOB,
        {
          instituteId,
          studentId,
          initiatedByUserId: userId,
        },
        {
          attempts: STUDENT_ONBOARDING_SEND_CREDENTIALS_ATTEMPTS,
          backoff: {
            type: 'fixed',
            delay: STUDENT_ONBOARDING_SEND_CREDENTIALS_BACKOFF_MS,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      await this.onboardingAudit.logEmailQueued({
        instituteId,
        userId,
        studentId,
        maxAttempts: STUDENT_ONBOARDING_SEND_CREDENTIALS_ATTEMPTS,
      });

      this.domainEvents.emit(
        STUDENT_EVENTS.EMAIL_QUEUED,
        new StudentEmailQueuedEvent(instituteId, studentId, email, userId),
      );

      this.logger.log(
        `Queued onboarding email for studentId=${studentId} instituteId=${instituteId} email=${email}`,
      );

      return { emailStatus: STUDENT_EMAIL_STATUS.PENDING };
    } catch (error) {
      await this.prisma.student.update({
        where: { id: studentId },
        data: {
          emailStatus: STUDENT_EMAIL_STATUS.FAILED,
          emailSent: false,
          emailSentAt: null,
        },
      });

      await this.onboardingAudit.logEmailFailed(instituteId, userId, studentId, {
        reason: 'QUEUE_ERROR',
      });

      this.logger.error(
        `Failed to queue onboarding email for studentId=${studentId} instituteId=${instituteId} email=${email}: ${(error as Error).message}`,
      );

      return { emailStatus: STUDENT_EMAIL_STATUS.FAILED };
    }
  }

  private isSupabaseProvisioningEnabled(): boolean {
    return (this.config.get<string>('SUPABASE_PROVISIONING_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  private getSupabaseInviteRedirectUrl(): string {
    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    return `${frontendUrl}/auth/complete-invite`;
  }
}
