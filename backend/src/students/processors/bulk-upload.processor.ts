import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

const BCRYPT_ROUNDS = 12;
const REQUIRED_COLUMNS = ['Name', 'Email', 'Phone', 'Class', 'School', 'Fee Amount'];

export interface BulkUploadJobData {
  instituteId: string;
  userId: string;
  fileBuffer: number[]; // Buffer serialised as number array for Bull serialisation
}

export interface BulkUploadResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; email: string; reason: string }>;
  credentials: Array<{ name: string; email: string; tempPassword: string }>;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

@Processor('student-bulk-upload')
export class BulkUploadProcessor {
  private readonly logger = new Logger(BulkUploadProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Process('process')
  async handleBulkUpload(job: Job<BulkUploadJobData>): Promise<BulkUploadResult> {
    const { instituteId, userId, fileBuffer } = job.data;

    const result: BulkUploadResult = {
      created: 0,
      skipped: 0,
      errors: [],
      credentials: [],
    };

    const buffer = Buffer.from(Uint8Array.from(fileBuffer));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      result.errors.push({ row: 0, email: '', reason: 'No worksheet found in file' });
      return result;
    }

    // Read header row
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell) => headers.push(String(cell.value ?? '').trim()));

    // Validate required columns
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

    // Get student role id
    const studentRole = await this.prisma.role.findFirst({ where: { name: 'student' } });
    if (!studentRole) {
      this.logger.error('Student role not seeded');
      result.errors.push({ row: 0, email: '', reason: 'Student role not found in database' });
      return result;
    }

    const rowCount = worksheet.rowCount;

    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);

      const getCellValue = (colName: string): string => {
        const idx = colIndex(colName);
        if (idx < 0) return '';
        const val = row.getCell(idx + 1).value;
        return val !== null && val !== undefined ? String(val).trim() : '';
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
        result.errors.push({
          row: rowNum,
          email: email || '(unknown)',
          reason: 'Missing required field(s)',
        });
        result.skipped++;
        continue;
      }

      const feeAmount = parseFloat(feeAmountStr);
      if (isNaN(feeAmount) || feeAmount < 0) {
        result.errors.push({ row: rowNum, email, reason: 'Invalid fee amount' });
        result.skipped++;
        continue;
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        result.errors.push({ row: rowNum, email, reason: 'Invalid email format' });
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

        await this.prisma.$transaction(async (tx) => {
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
              isEmailVerified: true, // students don't verify email
            },
          });

          await tx.student.create({
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
        this.logger.error(`Row ${rowNum}: ${err}`);
        result.errors.push({ row: rowNum, email, reason: 'Failed to create student' });
        result.skipped++;
      }
    }

    return result;
  }
}
