import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { AssessmentStatus, SubmissionStatus } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

const MAX_ANSWER_SHEET_SIZE = 20 * 1024 * 1024; // 20MB

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUpload: FileUploadService,
  ) {}

  // ─── Get student record ───────────────────────────────────────────────
  private async getStudentRecord(instituteId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  // ─── Start exam ───────────────────────────────────────────────────────
  async startExam(instituteId: string, userId: string, assessmentId: string) {
    const student = await this.getStudentRecord(instituteId, userId);

    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    if (
      assessment.status !== AssessmentStatus.active &&
      assessment.status !== AssessmentStatus.published
    ) {
      // Check if student has valid extra time that keeps window open
      const extraTime = await this.prisma.assessmentExtraTime.findUnique({
        where: { assessmentId_studentId: { assessmentId, studentId: student.id } },
      });
      const effectiveEndAt =
        assessment.endAt && extraTime
          ? new Date(assessment.endAt.getTime() + extraTime.extraMinutes * 60 * 1000)
          : null;
      if (!effectiveEndAt || new Date() >= effectiveEndAt) {
        throw new BadRequestException('Assessment is not open for submission');
      }
    }

    // Check if already exists
    const existing = await this.prisma.submission.findUnique({
      where: {
        assessmentId_studentId: {
          assessmentId,
          studentId: student.id,
        },
      },
    });

    if (existing) {
      // Evaluated submissions can never be reopened
      if (existing.status === SubmissionStatus.evaluated) {
        throw new ConflictException('You have already submitted this assessment');
      }

      // Submitted submissions can be reopened if student has active extra time
      if (existing.status === SubmissionStatus.submitted) {
        const extraTime = await this.prisma.assessmentExtraTime.findUnique({
          where: { assessmentId_studentId: { assessmentId, studentId: student.id } },
        });
        if (extraTime && assessment.endAt) {
          const effectiveEndAt = new Date(
            assessment.endAt.getTime() + extraTime.extraMinutes * 60 * 1000,
          );
          if (new Date() < effectiveEndAt) {
            // Reopen — lift the submission lock, preserve existing answers
            return this.prisma.submission.update({
              where: { id: existing.id },
              data: { status: SubmissionStatus.in_progress, submittedAt: null, autoSubmitted: false },
            });
          }
        }
        throw new ConflictException('You have already submitted this assessment');
      }

      // Reopen absent submissions (e.g. cron marked absent, extra time granted)
      if (existing.status !== SubmissionStatus.in_progress) {
        return this.prisma.submission.update({
          where: { id: existing.id },
          data: { status: SubmissionStatus.in_progress, autoSubmitted: false, submittedAt: null },
        });
      }
      return existing;
    }

    // Create new submission
    return this.prisma.submission.create({
      data: {
        assessmentId,
        studentId: student.id,
        instituteId,
        status: SubmissionStatus.in_progress,
        answers: {},
        lastSavedAt: new Date(),
      },
    });
  }

  // ─── Auto-save answers ────────────────────────────────────────────────
  async saveAnswers(
    instituteId: string,
    userId: string,
    assessmentId: string,
    dto: SaveAnswersDto,
  ) {
    const student = await this.getStudentRecord(instituteId, userId);

    const submission = await this.prisma.submission.findFirst({
      where: {
        assessmentId,
        studentId: student.id,
        status: SubmissionStatus.in_progress,
      },
    });
    if (!submission) throw new NotFoundException('Active submission not found');

    return this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        answers: dto.answers ?? {},
        lastSavedAt: new Date(),
      },
    });
  }

  // ─── Submit exam ──────────────────────────────────────────────────────
  async submitExam(
    instituteId: string,
    userId: string,
    assessmentId: string,
    dto: SaveAnswersDto,
  ) {
    const student = await this.getStudentRecord(instituteId, userId);

    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, instituteId, isDeleted: false },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    // Check if student has extra time — effective end time may be later
    const extraTime = await this.prisma.assessmentExtraTime.findUnique({
      where: { assessmentId_studentId: { assessmentId, studentId: student.id } },
    });

    const effectiveEndAt = assessment.endAt && extraTime
      ? new Date(assessment.endAt.getTime() + extraTime.extraMinutes * 60 * 1000)
      : assessment.endAt;

    // Assessment is closed AND student's extra time has also passed
    if (assessment.status === AssessmentStatus.closed) {
      if (!effectiveEndAt || new Date() > effectiveEndAt) {
        throw new BadRequestException('Assessment is already closed');
      }
      // Student still has extra time — allow submission
    }

    const submission = await this.prisma.submission.findFirst({
      where: {
        assessmentId,
        studentId: student.id,
        status: SubmissionStatus.in_progress,
      },
    });
    if (!submission) throw new NotFoundException('Active submission not found');

    return this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        answers: dto.answers ?? submission.answers ?? {},
        status: SubmissionStatus.submitted,
        submittedAt: new Date(),
        lastSavedAt: new Date(),
      },
    });
  }

  // ─── Upload single answer sheet (PDF) ────────────────────────────────
  async uploadAnswerSheet(
    instituteId: string,
    userId: string,
    assessmentId: string,
    file: Express.Multer.File,
  ) {
    const student = await this.getStudentRecord(instituteId, userId);

    const submission = await this.prisma.submission.findFirst({
      where: {
        assessmentId,
        studentId: student.id,
        status: SubmissionStatus.in_progress,
      },
    });
    if (!submission) throw new NotFoundException('Active submission not found');

    // Validate: PDF only
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype !== 'application/pdf' || ext !== '.pdf') {
      throw new BadRequestException('Only PDF files are allowed for answer sheets');
    }
    if (file.size > MAX_ANSWER_SHEET_SIZE) {
      throw new BadRequestException('File size must not exceed 20MB');
    }

    // Delete any previously uploaded answer sheet
    const existingFiles = (submission.uploadedFiles as any[]) ?? [];
    for (const f of existingFiles) {
      this.fileUpload.deleteFile(f.filePath);
    }

    // Save new file
    const uuid = require('uuid').v4() as string;
    const relativePath = `/${instituteId}/submissions/${submission.id}/${uuid}.pdf`;
    const absDir = this.fileUpload.getAbsolutePath(
      `/${instituteId}/submissions/${submission.id}`,
    );
    fs.mkdirSync(absDir, { recursive: true });
    fs.writeFileSync(this.fileUpload.getAbsolutePath(relativePath), file.buffer);

    const saved = [{
      filePath: relativePath,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    }];

    await this.prisma.submission.update({
      where: { id: submission.id },
      data: { uploadedFiles: saved },
    });

    return saved[0];
  }

  // ─── Get student's own submission ─────────────────────────────────────
  async getMySubmission(
    instituteId: string,
    userId: string,
    assessmentId: string,
  ) {
    const student = await this.getStudentRecord(instituteId, userId);

    const submission = await this.prisma.submission.findUnique({
      where: {
        assessmentId_studentId: {
          assessmentId,
          studentId: student.id,
        },
      },
    });

    return submission;
  }
}
