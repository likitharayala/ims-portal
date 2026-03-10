import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AttendanceDateQueryDto, AttendanceReportQueryDto } from './dto/attendance-query.dto';
import { AttendanceStatus } from '@prisma/client';
import ExcelJS from 'exceljs';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── Helper: resolve student from userId ────────────────────────────────────
  private async getStudentRecord(instituteId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  // ─── Admin: list students with attendance for a date ────────────────────────
  async listByDate(instituteId: string, query: AttendanceDateQueryDto) {
    const date = new Date(query.date);

    const students = await this.prisma.student.findMany({
      where: {
        instituteId,
        isDeleted: false,
        ...(query.class ? { class: query.class } : {}),
      },
      include: {
        user: { select: { name: true, email: true } },
        attendances: {
          where: { date },
          select: { id: true, status: true, notes: true },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return students.map((s) => ({
      studentId: s.id,
      name: s.user.name,
      email: s.user.email,
      class: s.class,
      rollNumber: s.rollNumber,
      attendance: s.attendances[0] ?? null,
    }));
  }

  // ─── Admin: bulk mark/upsert attendance ─────────────────────────────────────
  async markAttendance(instituteId: string, userId: string, dto: MarkAttendanceDto) {
    const date = new Date(dto.date);

    // Validate all students belong to this institute
    const studentIds = dto.entries.map((e) => e.studentId);
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, instituteId, isDeleted: false },
      select: { id: true },
    });
    const validIds = new Set(students.map((s) => s.id));

    const upserts = dto.entries
      .filter((e) => validIds.has(e.studentId))
      .map((entry) =>
        this.prisma.attendance.upsert({
          where: {
            instituteId_studentId_date: {
              instituteId,
              studentId: entry.studentId,
              date,
            },
          },
          create: {
            instituteId,
            studentId: entry.studentId,
            date,
            status: entry.status,
            markedBy: userId,
            notes: entry.notes,
          },
          update: {
            status: entry.status,
            markedBy: userId,
            notes: entry.notes ?? null,
          },
        }),
      );

    await this.prisma.$transaction(upserts);

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'MARK_ATTENDANCE',
        newValues: { date: dto.date, count: upserts.length },
      });
    } catch {}

    return { marked: upserts.length, date: dto.date };
  }

  // ─── Admin: monthly report — per student summary ─────────────────────────────
  async monthlyReport(instituteId: string, query: AttendanceReportQueryDto) {
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();

    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0); // last day of month

    const students = await this.prisma.student.findMany({
      where: {
        instituteId,
        isDeleted: false,
        ...(query.class ? { class: query.class } : {}),
      },
      include: {
        user: { select: { name: true, email: true } },
        attendances: {
          where: { date: { gte: from, lte: to } },
          select: { date: true, status: true },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    // Count total working days (days where ANY attendance was recorded)
    const allDates = await this.prisma.attendance.findMany({
      where: {
        instituteId,
        date: { gte: from, lte: to },
        student: {
          isDeleted: false,
          ...(query.class ? { class: query.class } : {}),
        },
      },
      select: { date: true },
      distinct: ['date'],
    });
    const totalDays = allDates.length;

    return {
      month,
      year,
      monthName: MONTHS[month],
      totalDays,
      students: students.map((s) => {
        const present = s.attendances.filter(
          (a) => a.status === AttendanceStatus.present,
        ).length;
        const late = s.attendances.filter(
          (a) => a.status === AttendanceStatus.late,
        ).length;
        const absent = s.attendances.filter(
          (a) => a.status === AttendanceStatus.absent,
        ).length;
        const percentage =
          totalDays > 0 ? Math.round(((present + late) / totalDays) * 100) : 0;

        return {
          studentId: s.id,
          name: s.user.name,
          email: s.user.email,
          class: s.class,
          rollNumber: s.rollNumber,
          present,
          late,
          absent,
          unmarked: totalDays - (present + late + absent),
          percentage,
          records: s.attendances,
        };
      }),
    };
  }

  // ─── Admin: Excel export ────────────────────────────────────────────────────
  async exportAttendance(instituteId: string, query: AttendanceReportQueryDto) {
    const report = await this.monthlyReport(instituteId, query);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${report.monthName} ${report.year}`);

    ws.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Class', key: 'class', width: 12 },
      { header: 'Roll No.', key: 'rollNumber', width: 12 },
      { header: 'Present', key: 'present', width: 10 },
      { header: 'Late', key: 'late', width: 10 },
      { header: 'Absent', key: 'absent', width: 10 },
      { header: 'Total Days', key: 'totalDays', width: 12 },
      { header: 'Attendance %', key: 'percentage', width: 14 },
    ];

    ws.getRow(1).font = { bold: true };

    for (const s of report.students) {
      ws.addRow({
        name: s.name,
        class: s.class,
        rollNumber: s.rollNumber ?? '',
        present: s.present,
        late: s.late,
        absent: s.absent,
        totalDays: report.totalDays,
        percentage: `${s.percentage}%`,
      });
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  // ─── Teacher: mark attendance for assigned classes only ─────────────────────
  async markAttendanceAsTeacher(
    instituteId: string,
    userId: string,
    dto: MarkAttendanceDto,
  ) {
    // Get teacher's assigned classes
    const teacher = await this.prisma.teacher.findFirst({
      where: { instituteId, userId, isDeleted: false },
      select: { id: true, assignedClasses: true },
    });
    if (!teacher) throw new NotFoundException('Teacher profile not found');

    const date = new Date(dto.date);

    // Only allow marking students in teacher's assigned classes
    const validStudents = await this.prisma.student.findMany({
      where: {
        id: { in: dto.entries.map((e) => e.studentId) },
        instituteId,
        isDeleted: false,
        class: { in: teacher.assignedClasses },
      },
      select: { id: true },
    });
    const validIds = new Set(validStudents.map((s) => s.id));

    const upserts = dto.entries
      .filter((e) => validIds.has(e.studentId))
      .map((entry) =>
        this.prisma.attendance.upsert({
          where: {
            instituteId_studentId_date: {
              instituteId,
              studentId: entry.studentId,
              date,
            },
          },
          create: {
            instituteId,
            studentId: entry.studentId,
            date,
            status: entry.status,
            markedBy: userId,
            notes: entry.notes,
          },
          update: {
            status: entry.status,
            markedBy: userId,
            notes: entry.notes ?? null,
          },
        }),
      );

    await this.prisma.$transaction(upserts);
    return { marked: upserts.length, date: dto.date };
  }

  // ─── Admin: get filter options (classes) ────────────────────────────────────
  async getFilterOptions(instituteId: string) {
    const classes = await this.prisma.student.findMany({
      where: { instituteId, isDeleted: false },
      select: { class: true },
      distinct: ['class'],
      orderBy: { class: 'asc' },
    });
    return { classes: classes.map((c) => c.class) };
  }

  // ─── Student: own attendance for a month ────────────────────────────────────
  async getStudentAttendance(
    instituteId: string,
    userId: string,
    query: AttendanceReportQueryDto,
  ) {
    const student = await this.getStudentRecord(instituteId, userId);

    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();

    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0);

    const records = await this.prisma.attendance.findMany({
      where: { studentId: student.id, date: { gte: from, lte: to } },
      select: { date: true, status: true, notes: true },
      orderBy: { date: 'asc' },
    });

    const present = records.filter((r) => r.status === AttendanceStatus.present).length;
    const late = records.filter((r) => r.status === AttendanceStatus.late).length;
    const absent = records.filter((r) => r.status === AttendanceStatus.absent).length;

    // Total days = distinct days recorded for ANY student in institute for this month
    const totalDays = await this.prisma.attendance.findMany({
      where: {
        instituteId,
        date: { gte: from, lte: to },
        student: { isDeleted: false },
      },
      select: { date: true },
      distinct: ['date'],
    }).then((r) => r.length);

    const percentage =
      totalDays > 0 ? Math.round(((present + late) / totalDays) * 100) : 0;

    return {
      month,
      year,
      monthName: MONTHS[month],
      totalDays,
      present,
      late,
      absent,
      unmarked: totalDays - (present + late + absent),
      percentage,
      records: records.map((r) => ({
        date: r.date,
        status: r.status,
        notes: r.notes,
      })),
    };
  }
}
