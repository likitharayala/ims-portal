import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AiService } from '../ai/ai.service';
import { GenerateQuestionsDto } from '../ai/dto/generate-questions.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { ListAssessmentsQueryDto } from './dto/list-assessments-query.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { GrantExtraTimeDto } from './dto/grant-extra-time.dto';
import { AssessmentStatus, SubmissionStatus } from '@prisma/client';

const PAGE_SIZE = 20;
const MAX_QUESTIONS = 100;

const assessmentSelect = {
  id: true,
  title: true,
  description: true,
  instructions: true,
  subject: true,
  totalMarks: true,
  negativeMarking: true,
  negativeValue: true,
  status: true,
  startAt: true,
  endAt: true,
  resultsReleased: true,
  questionTypePreference: true,
  difficultyDistribution: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { questions: true, submissions: true } },
} as const;

const questionSelect = {
  id: true,
  questionNumber: true,
  questionType: true,
  questionText: true,
  optionA: true,
  optionB: true,
  optionC: true,
  optionD: true,
  correctOption: true,
  marks: true,
  difficultyLevel: true,
  aiGenerated: true,
  createdAt: true,
} as const;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly aiService: AiService,
  ) {}

  // ─── Admin: Create ────────────────────────────────────────────────────
  async createAssessment(
    instituteId: string,
    userId: string,
    dto: CreateAssessmentDto,
  ) {
    const assessment = await this.prisma.assessment.create({
      data: {
        instituteId,
        title: dto.title,
        description: dto.description,
        instructions: dto.instructions,
        subject: dto.subject,
        totalMarks: dto.totalMarks,
        negativeMarking: dto.negativeMarking ?? false,
        negativeValue: dto.negativeValue,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        questionTypePreference: dto.questionTypePreference,
        difficultyDistribution: dto.difficultyDistribution,
        createdBy: userId,
        status: AssessmentStatus.draft,
      },
      select: assessmentSelect,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'CREATE_ASSESSMENT',
        targetId: assessment.id,
        targetType: 'assessment',
        newValues: { title: dto.title },
      });
    } catch {}

    return assessment;
  }

  // ─── Admin: List (all statuses) ───────────────────────────────────────
  async listAssessmentsAdmin(
    instituteId: string,
    query: ListAssessmentsQueryDto,
  ) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = { instituteId, isDeleted: false };

    if (query.status) where.status = query.status as AssessmentStatus;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        select: assessmentSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.assessment.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─── Student: List (published/active/closed/evaluated only) ──────────
  async listAssessmentsStudent(
    instituteId: string,
    query: ListAssessmentsQueryDto,
  ) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = {
      instituteId,
      isDeleted: false,
      status: {
        in: [
          AssessmentStatus.published,
          AssessmentStatus.active,
          AssessmentStatus.closed,
          AssessmentStatus.evaluated,
        ],
      },
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          instructions: true,
          subject: true,
          totalMarks: true,
          negativeMarking: true,
          status: true,
          startAt: true,
          endAt: true,
          resultsReleased: true,
          createdAt: true,
          _count: { select: { questions: true } },
        },
        orderBy: { startAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.assessment.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─── Get one (scoped) ─────────────────────────────────────────────────
  async getAssessment(
    instituteId: string,
    id: string,
    includeQuestions = false,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, instituteId, isDeleted: false },
      select: {
        ...assessmentSelect,
        ...(includeQuestions && {
          questions: {
            select: questionSelect,
            orderBy: { questionNumber: 'asc' },
          },
        }),
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  // ─── Admin: Update ────────────────────────────────────────────────────
  async updateAssessment(
    instituteId: string,
    userId: string,
    id: string,
    dto: UpdateAssessmentDto,
  ) {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, instituteId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Assessment not found');

    // Determine the effective start/end times after this update
    const newStartAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const newEndAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;

    // Recalculate status when times change and assessment is not draft/evaluated
    let recalculatedStatus: AssessmentStatus | undefined;
    const timesChanged = dto.startAt !== undefined || dto.endAt !== undefined;
    const isRecalculable =
      existing.status !== AssessmentStatus.draft &&
      existing.status !== AssessmentStatus.evaluated;

    if (timesChanged && isRecalculable && newStartAt && newEndAt) {
      const now = new Date();
      if (newEndAt < now) {
        recalculatedStatus = AssessmentStatus.closed;
      } else if (newStartAt <= now) {
        recalculatedStatus = AssessmentStatus.active;
      } else {
        recalculatedStatus = AssessmentStatus.published;
      }
    }

    const updated = await this.prisma.assessment.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.instructions !== undefined && {
          instructions: dto.instructions,
        }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.totalMarks !== undefined && { totalMarks: dto.totalMarks }),
        ...(dto.negativeMarking !== undefined && {
          negativeMarking: dto.negativeMarking,
        }),
        ...(dto.negativeValue !== undefined && {
          negativeValue: dto.negativeValue,
        }),
        ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
        ...(dto.questionTypePreference !== undefined && { questionTypePreference: dto.questionTypePreference }),
        ...(dto.difficultyDistribution !== undefined && { difficultyDistribution: dto.difficultyDistribution }),
        ...(recalculatedStatus !== undefined && { status: recalculatedStatus }),
      },
      select: assessmentSelect,
    });

    // Reopen all auto-submitted attempts when end time is extended into the future
    if (dto.endAt !== undefined && newEndAt && newEndAt > new Date()) {
      await this.prisma.submission.updateMany({
        where: {
          assessmentId: id,
          autoSubmitted: true,
          status: SubmissionStatus.submitted,
        },
        data: {
          status: SubmissionStatus.in_progress,
          autoSubmitted: false,
          submittedAt: null,
        },
      });
    }

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_ASSESSMENT',
        targetId: id,
        targetType: 'assessment',
        newValues: dto as Record<string, unknown>,
      });
    } catch {}

    return updated;
  }

  // ─── Admin: Publish ───────────────────────────────────────────────────
  async publishAssessment(instituteId: string, userId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, instituteId, isDeleted: false },
      include: { _count: { select: { questions: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment.status !== AssessmentStatus.draft) {
      throw new BadRequestException('Only draft assessments can be published');
    }
    if (assessment._count.questions === 0) {
      throw new BadRequestException(
        'Assessment must have at least 1 question before publishing',
      );
    }
    if (!assessment.startAt || !assessment.endAt) {
      throw new BadRequestException(
        'Both start time and end time are required before publishing',
      );
    }

    const updated = await this.prisma.assessment.update({
      where: { id },
      data: { status: AssessmentStatus.published },
      select: assessmentSelect,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'PUBLISH_ASSESSMENT',
        targetId: id,
        targetType: 'assessment',
      });
    } catch {}

    return updated;
  }

  // ─── Admin: Delete (soft) ─────────────────────────────────────────────
  async deleteAssessment(instituteId: string, userId: string, id: string) {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, instituteId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Assessment not found');

    await this.prisma.assessment.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'DELETE_ASSESSMENT',
        targetId: id,
        targetType: 'assessment',
      });
    } catch {}
  }

  // ─── Admin: Duplicate ─────────────────────────────────────────────────
  async duplicateAssessment(instituteId: string, userId: string, id: string) {
    const source = await this.prisma.assessment.findFirst({
      where: { id, instituteId, isDeleted: false },
      include: {
        questions: { orderBy: { questionNumber: 'asc' } },
      },
    });
    if (!source) throw new NotFoundException('Assessment not found');

    const newAssessment = await this.prisma.assessment.create({
      data: {
        instituteId,
        title: `${source.title} (Copy)`,
        description: source.description,
        instructions: source.instructions,
        subject: source.subject,
        totalMarks: source.totalMarks,
        negativeMarking: source.negativeMarking,
        negativeValue: source.negativeValue,
        status: AssessmentStatus.draft,
        createdBy: userId,
        // startAt and endAt NOT copied — per CLAUDE.md spec
      },
    });

    // Copy questions
    if (source.questions.length > 0) {
      await this.prisma.assessmentQuestion.createMany({
        data: source.questions.map((q) => ({
          assessmentId: newAssessment.id,
          instituteId,
          questionNumber: q.questionNumber,
          questionType: q.questionType,
          questionText: q.questionText,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          correctOption: q.correctOption,
          marks: q.marks,
        })),
      });
    }

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'DUPLICATE_ASSESSMENT',
        targetId: newAssessment.id,
        targetType: 'assessment',
        newValues: { sourceId: id },
      });
    } catch {}

    return this.getAssessment(instituteId, newAssessment.id, true);
  }

  // ─── Questions: Add ───────────────────────────────────────────────────
  async addQuestion(
    instituteId: string,
    assessmentId: string,
    dto: CreateQuestionDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
      include: { _count: { select: { questions: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment._count.questions >= MAX_QUESTIONS) {
      throw new BadRequestException(
        `Maximum ${MAX_QUESTIONS} questions allowed per assessment`,
      );
    }

    if (dto.questionType === 'mcq') {
      if (!dto.optionA || !dto.optionB || !dto.optionC || !dto.optionD) {
        throw new BadRequestException('MCQ questions must have all 4 options');
      }
      if (!dto.correctOption) {
        throw new BadRequestException(
          'MCQ questions must have a correct option',
        );
      }
    }

    const question = await this.prisma.assessmentQuestion.create({
      data: {
        assessmentId,
        instituteId,
        questionNumber: assessment._count.questions + 1,
        questionType: dto.questionType as any,
        questionText: dto.questionText,
        optionA: dto.optionA,
        optionB: dto.optionB,
        optionC: dto.optionC,
        optionD: dto.optionD,
        correctOption: dto.correctOption,
        marks: dto.marks,
        difficultyLevel: dto.difficultyLevel,
      },
      select: questionSelect,
    });

    return question;
  }

  // ─── Questions: Update ────────────────────────────────────────────────
  async updateQuestion(
    instituteId: string,
    assessmentId: string,
    questionId: string,
    dto: UpdateQuestionDto,
  ) {
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: { id: questionId, assessmentId, instituteId },
    });
    if (!question) throw new NotFoundException('Question not found');

    return this.prisma.assessmentQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.questionText !== undefined && {
          questionText: dto.questionText,
        }),
        ...(dto.optionA !== undefined && { optionA: dto.optionA }),
        ...(dto.optionB !== undefined && { optionB: dto.optionB }),
        ...(dto.optionC !== undefined && { optionC: dto.optionC }),
        ...(dto.optionD !== undefined && { optionD: dto.optionD }),
        ...(dto.correctOption !== undefined && {
          correctOption: dto.correctOption,
        }),
        ...(dto.marks !== undefined && { marks: dto.marks }),
      },
      select: questionSelect,
    });
  }

  // ─── Questions: Delete ────────────────────────────────────────────────
  async deleteQuestion(
    instituteId: string,
    assessmentId: string,
    questionId: string,
  ) {
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: { id: questionId, assessmentId, instituteId },
    });
    if (!question) throw new NotFoundException('Question not found');

    await this.prisma.assessmentQuestion.delete({ where: { id: questionId } });

    // Renumber remaining questions
    const remaining = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { questionNumber: 'asc' },
    });

    for (let i = 0; i < remaining.length; i++) {
      await this.prisma.assessmentQuestion.update({
        where: { id: remaining[i].id },
        data: { questionNumber: i + 1 },
      });
    }
  }

  // ─── Get questions for an assessment ─────────────────────────────────
  async getQuestions(instituteId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    return this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      select: questionSelect,
      orderBy: { questionNumber: 'asc' },
    });
  }

  // ─── AI: Generate and add questions ──────────────────────────────────
  async generateQuestions(
    instituteId: string,
    assessmentId: string,
    dto: GenerateQuestionsDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
      include: { _count: { select: { questions: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const remaining = MAX_QUESTIONS - assessment._count.questions;
    if (remaining <= 0) {
      throw new BadRequestException(
        `Assessment already has the maximum of ${MAX_QUESTIONS} questions`,
      );
    }

    const count = Math.min(dto.count, remaining);
    const generated = await this.aiService.generateQuestions({ ...dto, count });

    const startNumber = assessment._count.questions + 1;
    const rows = generated.map((q, i) => {
      const base = {
        assessmentId,
        instituteId,
        questionNumber: startNumber + i,
        questionType: dto.questionType as any,
        questionText: (q as any).questionText as string,
        marks: (q as any).marks ?? 1,
      };
      if (dto.questionType === 'mcq') {
        return {
          ...base,
          optionA: (q as any).optionA as string,
          optionB: (q as any).optionB as string,
          optionC: (q as any).optionC as string,
          optionD: (q as any).optionD as string,
          correctOption: (q as any).correctOption as string,
        };
      }
      return base;
    });

    await this.prisma.assessmentQuestion.createMany({ data: rows });

    return this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      select: questionSelect,
      orderBy: { questionNumber: 'asc' },
    });
  }

  // ─── Extra Time: Grant / Update ───────────────────────────────────────
  async grantExtraTime(
    instituteId: string,
    userId: string,
    assessmentId: string,
    dto: GrantExtraTimeDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, instituteId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');

    const record = await this.prisma.assessmentExtraTime.upsert({
      where: { assessmentId_studentId: { assessmentId, studentId: dto.studentId } },
      create: {
        assessmentId,
        studentId: dto.studentId,
        instituteId,
        extraMinutes: dto.extraMinutes,
        reason: dto.reason,
      },
      update: {
        extraMinutes: dto.extraMinutes,
        reason: dto.reason,
      },
    });

    // Compute effective end time after granting extra time
    const effectiveEndAt = assessment.endAt
      ? new Date(assessment.endAt.getTime() + dto.extraMinutes * 60 * 1000)
      : null;

    // Reopen auto-submitted submission if the effective window is still open
    let submissionReopened = false;
    if (effectiveEndAt && new Date() < effectiveEndAt) {
      const submission = await this.prisma.submission.findUnique({
        where: {
          assessmentId_studentId: {
            assessmentId,
            studentId: dto.studentId,
          },
        },
      });
      if (
        submission &&
        submission.autoSubmitted &&
        submission.status === SubmissionStatus.submitted
      ) {
        await this.prisma.submission.update({
          where: { id: submission.id },
          data: {
            status: SubmissionStatus.in_progress,
            autoSubmitted: false,
            submittedAt: null,
          },
        });
        submissionReopened = true;
      }
    }

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'GRANT_EXTRA_TIME',
        targetId: assessmentId,
        targetType: 'assessment',
        newValues: { studentId: dto.studentId, extraMinutes: dto.extraMinutes, submissionReopened },
      });
    } catch {}

    return { ...record, submissionReopened, effectiveEndAt };
  }

  // ─── Extra Time: List all for assessment ──────────────────────────────
  async listExtraTime(instituteId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    return this.prisma.assessmentExtraTime.findMany({
      where: { assessmentId, instituteId, student: { isDeleted: false } },
      include: {
        student: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Extra Time: Remove ───────────────────────────────────────────────
  async removeExtraTime(
    instituteId: string,
    userId: string,
    assessmentId: string,
    studentId: string,
  ) {
    const record = await this.prisma.assessmentExtraTime.findFirst({
      where: {
        assessmentId,
        studentId,
        instituteId,
        student: { isDeleted: false },
      },
    });
    if (!record) throw new NotFoundException('Extra time record not found');

    await this.prisma.assessmentExtraTime.delete({ where: { id: record.id } });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'REMOVE_EXTRA_TIME',
        targetId: assessmentId,
        targetType: 'assessment',
        newValues: { studentId },
      });
    } catch {}
  }

  // ─── Extra Time: Get for one student ─────────────────────────────────
  async getStudentExtraTime(
    instituteId: string,
    userId: string,
    assessmentId: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const extra = await this.prisma.assessmentExtraTime.findUnique({
      where: { assessmentId_studentId: { assessmentId, studentId: student.id } },
    });

    const effectiveEndAt = assessment.endAt && extra
      ? new Date(assessment.endAt.getTime() + extra.extraMinutes * 60 * 1000)
      : assessment.endAt;

    return {
      extraMinutes: extra?.extraMinutes ?? 0,
      reason: extra?.reason ?? null,
      effectiveEndAt,
    };
  }
}
