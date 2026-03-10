import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { EnterMarksDto } from './dto/enter-marks.dto';
import { AssessmentStatus, SubmissionStatus } from '@prisma/client';
import * as fs from 'fs';

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly fileUpload: FileUploadService,
  ) {}

  // ─── List submissions for an assessment ──────────────────────────────
  async listSubmissions(instituteId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const submissions = await this.prisma.submission.findMany({
      where: { assessmentId, instituteId },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return submissions.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      studentName: s.student.user.name,
      studentEmail: s.student.user.email,
      studentClass: s.student.class,
      studentIsDeleted: s.student.isDeleted,
      status: s.status,
      totalMarks: s.totalMarks,
      isFinalized: s.isFinalized,
      resultReleased: s.resultReleased,
      submittedAt: s.submittedAt,
      autoSubmitted: s.autoSubmitted,
    }));
  }

  // ─── Get a single submission with details ─────────────────────────────
  async getSubmission(
    instituteId: string,
    assessmentId: string,
    submissionId: string,
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, assessmentId, instituteId },
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        assessment: {
          include: {
            questions: { orderBy: { questionNumber: 'asc' } },
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    return submission;
  }

  // ─── Enter marks per question ─────────────────────────────────────────
  async enterMarks(
    instituteId: string,
    userId: string,
    assessmentId: string,
    submissionId: string,
    dto: EnterMarksDto,
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, assessmentId, instituteId },
      include: {
        assessment: {
          include: { questions: true },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    if (submission.status === SubmissionStatus.absent) {
      throw new BadRequestException('Cannot enter marks for absent students');
    }

    const existingFeedback = (submission.feedback as Record<string, any>) ?? {};
    const existingFlags = (submission.flaggedAnswers as Record<string, boolean>) ?? {};

    const updatedFeedback = { ...existingFeedback };
    const updatedFlags = { ...existingFlags };

    for (const markEntry of dto.marks) {
      updatedFeedback[markEntry.questionId] = {
        marks: markEntry.marks,
        comment: markEntry.comment ?? '',
      };
      if (markEntry.flagged !== undefined) {
        updatedFlags[markEntry.questionId] = markEntry.flagged;
      }
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        feedback: updatedFeedback,
        flaggedAnswers: updatedFlags,
        status: SubmissionStatus.evaluated,
        evaluatedBy: userId,
        evaluatedAt: new Date(),
      },
    });
  }

  // ─── Finalize submission ──────────────────────────────────────────────
  async finalizeSubmission(
    instituteId: string,
    userId: string,
    assessmentId: string,
    submissionId: string,
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, assessmentId, instituteId },
      include: {
        assessment: {
          include: { questions: true },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    if (submission.status === SubmissionStatus.absent) {
      // Absent students are already finalized by cron
      return submission;
    }

    const feedback = (submission.feedback as Record<string, any>) ?? {};
    const answers = (submission.answers as Record<string, any>) ?? {};
    const questions = submission.assessment.questions;

    // If submission has uploaded files, all questions are manually evaluated
    const isUploadSubmission = !!(
      submission.uploadedFiles &&
      Object.keys(submission.uploadedFiles as object).length > 0
    );

    let total = 0;
    const negativeMarking = submission.assessment.negativeMarking;
    const negativeValue = Number(submission.assessment.negativeValue ?? 0);

    for (const q of questions) {
      if (!isUploadSubmission && q.questionType === 'mcq' && q.correctOption) {
        // Auto-evaluate MCQ for portal (typed) submissions only
        const studentAnswer = answers[q.id]?.selectedOption;
        if (studentAnswer === q.correctOption) {
          total += Number(q.marks);
        } else if (studentAnswer && negativeMarking) {
          total -= negativeValue;
        }
      } else {
        // Descriptive OR uploaded submission MCQ — use admin-entered marks from feedback
        const marks = feedback[q.id]?.marks ?? 0;
        total += Number(marks);
      }
    }

    // Cap at 0 — never negative total
    total = Math.max(0, total);

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        totalMarks: total,
        isFinalized: true,
        status: SubmissionStatus.evaluated,
        evaluatedBy: userId,
        evaluatedAt: new Date(),
      },
    });
  }

  // ─── Release results (one student) ───────────────────────────────────
  async releaseResult(
    instituteId: string,
    assessmentId: string,
    submissionId: string,
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, assessmentId, instituteId },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: { resultReleased: true },
    });
  }

  // ─── Release all results ──────────────────────────────────────────────
  async releaseAllResults(
    instituteId: string,
    userId: string,
    assessmentId: string,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    await this.prisma.submission.updateMany({
      where: { assessmentId, instituteId, isFinalized: true },
      data: { resultReleased: true },
    });

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { resultsReleased: true },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'RELEASE_ASSESSMENT_RESULTS',
        targetId: assessmentId,
        targetType: 'assessment',
      });
    } catch {}
  }

  // ─── Mark as evaluated ────────────────────────────────────────────────
  async markAssessmentEvaluated(
    instituteId: string,
    userId: string,
    assessmentId: string,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    if (assessment.status !== AssessmentStatus.closed) {
      throw new BadRequestException(
        'Assessment must be closed before marking as evaluated',
      );
    }

    return this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: AssessmentStatus.evaluated },
    });
  }

  // ─── Assessment stats ─────────────────────────────────────────────────
  async getStats(instituteId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const submissions = await this.prisma.submission.findMany({
      where: { assessmentId, instituteId },
      select: {
        status: true,
        totalMarks: true,
        isFinalized: true,
      },
    });

    const evaluated = submissions.filter((s) => s.isFinalized && s.status !== SubmissionStatus.absent);
    const absent = submissions.filter((s) => s.status === SubmissionStatus.absent);
    const marks = evaluated
      .map((s) => Number(s.totalMarks ?? 0))
      .filter((m) => m >= 0);

    const highest = marks.length ? Math.max(...marks) : null;
    const lowest = marks.length ? Math.min(...marks) : null;
    const average =
      marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;

    return {
      total: submissions.length,
      submitted: submissions.filter(
        (s) => s.status === SubmissionStatus.submitted,
      ).length,
      evaluated: evaluated.length,
      absent: absent.length,
      highest,
      lowest,
      average: average !== null ? Math.round(average * 100) / 100 : null,
    };
  }

  // ─── Get student result (scoped) ──────────────────────────────────────
  async getStudentResult(
    instituteId: string,
    userId: string,
    assessmentId: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const submission = await this.prisma.submission.findUnique({
      where: {
        assessmentId_studentId: { assessmentId, studentId: student.id },
      },
      include: {
        assessment: {
          include: { questions: { orderBy: { questionNumber: 'asc' } } },
        },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    if (!submission.resultReleased) {
      throw new BadRequestException('Results have not been released yet');
    }

    return submission;
  }

  // ─── Admin: student performance history ──────────────────────────────
  async getStudentPerformanceHistory(instituteId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');

    const submissions = await this.prisma.submission.findMany({
      where: { studentId, instituteId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            subject: true,
            totalMarks: true,
            status: true,
            resultsReleased: true,
            startAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return submissions.map((s) => ({
      assessmentId: s.assessmentId,
      title: s.assessment.title,
      subject: s.assessment.subject,
      totalMarks: Number(s.assessment.totalMarks),
      marksObtained: s.totalMarks !== null ? Number(s.totalMarks) : null,
      status: s.status,
      isFinalized: s.isFinalized,
      resultReleased: s.resultReleased,
      submittedAt: s.submittedAt,
      evaluatedAt: s.evaluatedAt,
      startAt: s.assessment.startAt,
    }));
  }

  // ─── Student: released results only ──────────────────────────────────
  async getStudentResults(instituteId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const submissions = await this.prisma.submission.findMany({
      where: { studentId: student.id, instituteId, resultReleased: true, isFinalized: true },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            subject: true,
            totalMarks: true,
            startAt: true,
          },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
    });

    return submissions.map((s) => ({
      assessmentId: s.assessmentId,
      submissionId: s.id,
      title: s.assessment.title,
      subject: s.assessment.subject,
      totalMarks: Number(s.assessment.totalMarks),
      marksObtained: s.totalMarks !== null ? Number(s.totalMarks) : 0,
      status: s.status,
      startAt: s.assessment.startAt,
      evaluatedAt: s.evaluatedAt,
    }));
  }

  // ─── Student: own performance history ────────────────────────────────
  async getMyPerformanceHistory(instituteId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const submissions = await this.prisma.submission.findMany({
      where: { studentId: student.id, instituteId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            subject: true,
            totalMarks: true,
            status: true,
            resultsReleased: true,
            startAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return submissions.map((s) => ({
      assessmentId: s.assessmentId,
      title: s.assessment.title,
      subject: s.assessment.subject,
      totalMarks: Number(s.assessment.totalMarks),
      marksObtained: s.resultReleased && s.totalMarks !== null ? Number(s.totalMarks) : null,
      status: s.status,
      resultReleased: s.resultReleased,
      submittedAt: s.submittedAt,
      startAt: s.assessment.startAt,
    }));
  }

  // ─── Serve submission file ────────────────────────────────────────────
  getFilePath(instituteId: string, relativePath: string): string {
    if (!relativePath.startsWith(`/${instituteId}/`)) {
      throw new NotFoundException('File not found');
    }
    const abs = this.fileUpload.getAbsolutePath(relativePath);
    if (!fs.existsSync(abs)) throw new NotFoundException('File not found');
    return abs;
  }
}
