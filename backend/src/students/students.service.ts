import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileUploadService } from '../file-upload/file-upload.service';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DomainEventsService } from '../common/events/domain-events.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentOnboardingAuditService } from './student-onboarding-audit.service';
import { StudentOnboardingService } from './student-onboarding.service';
import { StudentBulkCreatedEvent } from './events/student-bulk-created.event';
import { STUDENT_EMAIL_STATUS, STUDENT_EVENTS } from './students.constants';

export interface BulkUploadResult {
  created: number;
  queuedForEmail: number;
  emailQueueFailures: number;
  skipped: number;
  errors: Array<{ row: number; email: string; reason: string }>;
}

const REQUIRED_COLUMNS = ['Name', 'Email', 'Phone', 'Class', 'School', 'Fee Amount'];

const PAGE_SIZE = 20;

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

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly domainEvents: DomainEventsService,
    private readonly fileUpload: FileUploadService,
    private readonly onboardingAudit: StudentOnboardingAuditService,
    private readonly studentOnboarding: StudentOnboardingService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────
  async createStudent(instituteId: string, userId: string, dto: CreateStudentDto) {
    return this.studentOnboarding.createStudentAndQueueCredentials(instituteId, userId, dto);
  }

  async resendCredentials(instituteId: string, userId: string, studentId: string) {
    return this.studentOnboarding.resendCredentials(instituteId, userId, studentId);
  }

  // ─────────────────────────────────────────────────────────────────────
  // List
  // ─────────────────────────────────────────────────────────────────────
  async listStudents(instituteId: string, query: ListStudentsQueryDto) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = { instituteId, isDeleted: false };

    if (query.class) where.class = query.class;
    if (query.school) where.school = query.school;

    if (query.search) {
      const s = query.search;
      where.OR = [
        { user: { name: { contains: s, mode: 'insensitive' } } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
        { user: { phone: { contains: s, mode: 'insensitive' } } },
        { class: { contains: s, mode: 'insensitive' } },
        { school: { contains: s, mode: 'insensitive' } },
        { rollNumber: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: studentSelect,
        orderBy: { joinedDate: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Get one
  // ─────────────────────────────────────────────────────────────────────
  async getStudent(instituteId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
      select: studentSelect,
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────────────
  async updateStudent(
    instituteId: string,
    userId: string,
    studentId: string,
    dto: UpdateStudentDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      // Update user fields
      if (dto.name !== undefined || dto.phone !== undefined) {
        await tx.user.update({
          where: { id: student.userId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
          },
        });
      }

      return tx.student.update({
        where: { id: studentId },
        data: {
          ...(dto.class !== undefined && { class: dto.class }),
          ...(dto.school !== undefined && { school: dto.school }),
          ...(dto.rollNumber !== undefined && { rollNumber: dto.rollNumber }),
          ...(dto.dateOfBirth !== undefined && { dateOfBirth: new Date(dto.dateOfBirth) }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.parentName !== undefined && { parentName: dto.parentName }),
          ...(dto.parentPhone !== undefined && { parentPhone: dto.parentPhone }),
          ...(dto.joinedDate !== undefined && { joinedDate: new Date(dto.joinedDate) }),
        },
        select: studentSelect,
      });
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_STUDENT',
        targetId: studentId,
        targetType: 'student',
        newValues: dto as Record<string, unknown>,
      });
    } catch {}

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Delete (soft)
  // ─────────────────────────────────────────────────────────────────────
  async deleteStudent(instituteId: string, userId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.student.update({
        where: { id: studentId },
        data: { isDeleted: true, deletedAt: now, deletedBy: userId },
      }),
      this.prisma.user.update({
        where: { id: student.userId },
        data: { isDeleted: true, deletedAt: now, deletedBy: userId, sessionId: null },
      }),
    ]);

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'DELETE_STUDENT',
        targetId: studentId,
        targetType: 'student',
      });
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────
  // Bulk upload
  // ─────────────────────────────────────────────────────────────────────
  async bulkUpload(
    instituteId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<BulkUploadResult> {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!file) throw new BadRequestException('No file uploaded');
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Only .xlsx files are allowed');
    }

    const result: BulkUploadResult = {
      created: 0,
      queuedForEmail: 0,
      emailQueueFailures: 0,
      skipped: 0,
      errors: [],
    };

    // Load workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      result.errors.push({ row: 0, email: '', reason: 'No worksheet found in file' });
      return result;
    }

    // Read header row
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => headers.push(String(cell.value ?? '').trim()));

    // Validate required columns exist
    const missingCols = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
    if (missingCols.length > 0) {
      result.errors.push({
        row: 1,
        email: '',
        reason: `Missing required columns: ${missingCols.join(', ')}`,
      });
      return result;
    }

    const colIndex = (name: string) => headers.indexOf(name);

    const studentRole = await this.prisma.role.findFirst({ where: { name: 'student' } });
    if (!studentRole) throw new InternalServerErrorException('Student role not seeded');

    const rowCount = worksheet.rowCount;

    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);

      const getCellValue = (colName: string): string => {
        const idx = colIndex(colName);
        if (idx < 0) return '';
        const val = row.getCell(idx + 1).value;
        if (val === null || val === undefined) return '';
        // Excel auto-converts emails to mailto: hyperlinks — ExcelJS returns an object
        // e.g. { text: 'user@gmail.com', hyperlink: 'mailto:user@gmail.com' }
        if (typeof val === 'object' && 'hyperlink' in (val as object)) {
          const h = (val as any).hyperlink as string;
          if (h?.startsWith('mailto:')) return h.replace('mailto:', '').trim();
          return String((val as any).text ?? '').trim();
        }
        if (typeof val === 'object' && 'text' in (val as object)) {
          return String((val as any).text ?? '').trim();
        }
        return String(val).trim();
      };

      const name = getCellValue('Name');
      const email = getCellValue('Email');
      const phone = getCellValue('Phone');
      const studentClass = getCellValue('Class');
      const school = getCellValue('School');
      const feeAmountStr = getCellValue('Fee Amount');

      // Skip completely empty rows
      if (!name && !email && !phone) continue;

      // Validate required fields
      if (!name || !email || !phone || !studentClass || !school || !feeAmountStr) {
        const missing = ['Name','Email','Phone','Class','School','Fee Amount']
          .filter((f) => !getCellValue(f))
          .join(', ');
        result.errors.push({ row: rowNum, email: email || '(unknown)', reason: `Missing: ${missing}` });
        result.skipped++;
        continue;
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        result.errors.push({ row: rowNum, email, reason: 'Invalid email format' });
        result.skipped++;
        continue;
      }

      // Validate fee amount
      const feeAmount = parseFloat(feeAmountStr);
      if (isNaN(feeAmount) || feeAmount < 0) {
        result.errors.push({ row: rowNum, email, reason: 'Invalid fee amount (must be a number >= 0)' });
        result.skipped++;
        continue;
      }

      // Check duplicate email
      const existing = await this.prisma.user.findFirst({ where: { email, isDeleted: false } });
      if (existing) {
        result.errors.push({ row: rowNum, email, reason: 'Email already exists' });
        result.skipped++;
        continue;
      }

      const payload: CreateStudentDto = {
        name,
        email,
        phone,
        class: studentClass,
        school,
        feeAmount,
        ...(getCellValue('Roll Number') && { rollNumber: getCellValue('Roll Number') }),
        ...(getCellValue('Date of Birth') && { dateOfBirth: getCellValue('Date of Birth') }),
        ...(getCellValue('Address') && { address: getCellValue('Address') }),
        ...(getCellValue('Parent Name') && { parentName: getCellValue('Parent Name') }),
        ...(getCellValue('Parent Phone') && { parentPhone: getCellValue('Parent Phone') }),
        ...(getCellValue('Joined Date') && { joinedDate: getCellValue('Joined Date') }),
      };

      try {
        const queueResult = await this.studentOnboarding.createStudentFromBulkUpload(
          instituteId,
          userId,
          payload,
          {
            studentRoleId: studentRole.id,
            skipExistingEmailCheck: true,
          },
        );
        result.created++;
        if (queueResult.emailStatus === STUDENT_EMAIL_STATUS.FAILED) {
          result.emailQueueFailures++;
        } else {
          result.queuedForEmail++;
        }
      } catch {
        result.errors.push({ row: rowNum, email, reason: 'Failed to create student record' });
        result.skipped++;
      }
    }

    await this.onboardingAudit.logBulkCreated(instituteId, userId, {
      created: result.created,
      skipped: result.skipped,
      queuedForEmail: result.queuedForEmail,
      emailQueueFailures: result.emailQueueFailures,
    });

    this.domainEvents.emit(
      STUDENT_EVENTS.BULK_CREATED,
      new StudentBulkCreatedEvent(
        instituteId,
        userId,
        result.created,
        result.skipped,
        result.queuedForEmail,
        result.emailQueueFailures,
      ),
    );

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Filter options (distinct classes + schools)
  // ─────────────────────────────────────────────────────────────────────
  async getFilterOptions(instituteId: string) {
    const [classes, schools] = await Promise.all([
      this.prisma.student.findMany({
        where: { instituteId, isDeleted: false },
        select: { class: true },
        distinct: ['class'],
        orderBy: { class: 'asc' },
      }),
      this.prisma.student.findMany({
        where: { instituteId, isDeleted: false },
        select: { school: true },
        distinct: ['school'],
        orderBy: { school: 'asc' },
      }),
    ]);

    return {
      classes: classes.map((s) => s.class),
      schools: schools.map((s) => s.school),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Export (Excel)
  // ─────────────────────────────────────────────────────────────────────
  async exportStudents(instituteId: string): Promise<Buffer> {
    const students = await this.prisma.student.findMany({
      where: { instituteId, isDeleted: false },
      select: studentSelect,
      orderBy: { joinedDate: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');

    sheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Class', key: 'class', width: 15 },
      { header: 'School', key: 'school', width: 30 },
      { header: 'Roll Number', key: 'rollNumber', width: 15 },
      { header: 'Date of Birth', key: 'dateOfBirth', width: 15 },
      { header: 'Address', key: 'address', width: 40 },
      { header: 'Parent Name', key: 'parentName', width: 25 },
      { header: 'Parent Phone', key: 'parentPhone', width: 15 },
      { header: 'Fee Amount', key: 'feeAmount', width: 15 },
      { header: 'Joined Date', key: 'joinedDate', width: 20 },
    ];

    for (const s of students) {
      sheet.addRow({
        name: s.user.name,
        email: s.user.email,
        phone: s.user.phone,
        class: s.class,
        school: s.school,
        rollNumber: s.rollNumber ?? '',
        dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString().split('T')[0] : '',
        address: s.address ?? '',
        parentName: s.parentName ?? '',
        parentPhone: s.parentPhone ?? '',
        feeAmount: Number(s.feeAmount),
        joinedDate: s.joinedDate.toISOString().split('T')[0],
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Bulk upload template
  // ─────────────────────────────────────────────────────────────────────
  async getBulkUploadTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');

    sheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Class', key: 'class', width: 15 },
      { header: 'School', key: 'school', width: 30 },
      { header: 'Fee Amount', key: 'feeAmount', width: 15 },
      { header: 'Roll Number', key: 'rollNumber', width: 15 },
      { header: 'Date of Birth', key: 'dateOfBirth', width: 15 },
      { header: 'Address', key: 'address', width: 40 },
      { header: 'Parent Name', key: 'parentName', width: 25 },
      { header: 'Parent Phone', key: 'parentPhone', width: 15 },
      { header: 'Joined Date', key: 'joinedDate', width: 20 },
    ];

    // Example row
    sheet.addRow({
      name: 'Arjun Sharma',
      email: 'arjun@example.com',
      phone: '9876543210',
      class: '10A',
      school: 'Delhi Public School',
      feeAmount: 2000,
      rollNumber: 'A001',
      dateOfBirth: '2008-05-15',
      address: '12 MG Road, Delhi',
      parentName: 'Suresh Sharma',
      parentPhone: '9876543211',
      joinedDate: '2024-06-01',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Admin: upload profile photo ──────────────────────────────────────
  async uploadProfilePhoto(instituteId: string, studentId: string, file: Express.Multer.File) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, instituteId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');

    const saved = await this.fileUpload.saveProfilePhoto(instituteId, studentId, file);

    // Delete old photo if exists
    if (student.profilePhotoPath) {
      this.fileUpload.deleteFile(student.profilePhotoPath);
    }

    await this.prisma.student.update({
      where: { id: studentId },
      data: { profilePhotoPath: saved.filePath },
    });

    return { profilePhotoPath: saved.filePath };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Student self-profile
  // ─────────────────────────────────────────────────────────────────────
  async getStudentProfile(userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { userId, isDeleted: false },
      select: studentSelect,
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  async updateStudentProfile(
    userId: string,
    dto: { name?: string; phone?: string; address?: string; parentName?: string; parentPhone?: string },
  ) {
    const student = await this.prisma.student.findFirst({
      where: { userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.phone !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
          },
        });
      }
      await tx.student.update({
        where: { id: student.id },
        data: {
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.parentName !== undefined && { parentName: dto.parentName }),
          ...(dto.parentPhone !== undefined && { parentPhone: dto.parentPhone }),
        },
      });
    });

    return this.getStudentProfile(userId);
  }
}
