import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileUploadService } from '../file-upload/file-upload.service';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';

export interface BulkUploadResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; email: string; reason: string }>;
  credentials: Array<{ name: string; email: string; tempPassword: string }>;
}

const REQUIRED_COLUMNS = ['Name', 'Email', 'Phone', 'Class', 'School', 'Fee Amount'];

const BCRYPT_ROUNDS = 12;
const PAGE_SIZE = 20;

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

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
    private readonly paymentsService: PaymentsService,
    private readonly fileUpload: FileUploadService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────
  async createStudent(instituteId: string, userId: string, dto: CreateStudentDto) {
    // Check email uniqueness
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, isDeleted: false },
    });
    if (existing) throw new ConflictException('A user with this email already exists');

    const studentRole = await this.prisma.role.findFirst({ where: { name: 'student' } });
    if (!studentRole) throw new Error('Student role not seeded');

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    const sessionId = uuidv4();

    const student = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          instituteId,
          roleId: studentRole.id,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          sessionId,
          mustChangePassword: true,
          isEmailVerified: true, // students don't verify email themselves
        },
      });

      return tx.student.create({
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
        },
        select: studentSelect,
      });
    });

    // Generate current-month payment record immediately
    try {
      await this.paymentsService.createPaymentForStudent(
        instituteId,
        student.id,
        student.feeAmount as any,
      );
    } catch {}

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'CREATE_STUDENT',
        targetId: student.id,
        targetType: 'student',
        newValues: { email: dto.email, class: dto.class, school: dto.school },
      });
    } catch {}

    return { student, tempPassword };
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
  // Bulk upload (synchronous — no Redis/queue required)
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

    const result: BulkUploadResult = { created: 0, skipped: 0, errors: [], credentials: [] };

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
    if (!studentRole) throw new Error('Student role not seeded');

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

      // Optional fields
      const rollNumber = getCellValue('Roll Number') || undefined;
      const dobStr = getCellValue('Date of Birth');
      const address = getCellValue('Address') || undefined;
      const parentName = getCellValue('Parent Name') || undefined;
      const parentPhone = getCellValue('Parent Phone') || undefined;
      const joinedDateStr = getCellValue('Joined Date');
      const dateOfBirth = dobStr ? new Date(dobStr) : undefined;
      const joinedDate = joinedDateStr ? new Date(joinedDateStr) : new Date();

      try {
        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        const sessionId = uuidv4();

        const student = await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              instituteId,
              roleId: studentRole.id,
              name,
              email,
              phone,
              passwordHash,
              sessionId,
              mustChangePassword: true,
              isEmailVerified: true,
            },
          });
          return tx.student.create({
            data: {
              instituteId,
              userId: user.id,
              rollNumber,
              class: studentClass,
              school,
              feeAmount,
              dateOfBirth: dateOfBirth ?? null,
              address,
              parentName,
              parentPhone,
              joinedDate,
            },
          });
        });

        // Create current-month payment record
        try {
          await this.paymentsService.createPaymentForStudent(instituteId, student.id, feeAmount as any);
        } catch {}

        result.created++;
        result.credentials.push({ name, email, tempPassword });

        try {
          await this.auditLog.record({
            instituteId,
            userId,
            action: 'BULK_CREATE_STUDENT',
            newValues: { name, email, class: studentClass, school },
          });
        } catch {}
      } catch (err) {
        result.errors.push({ row: rowNum, email, reason: 'Failed to create student record' });
        result.skipped++;
      }
    }

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
