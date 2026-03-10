import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

function generateTempPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async getTeacherRecord(instituteId: string, userId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!teacher) throw new NotFoundException('Teacher profile not found');
    return teacher;
  }

  // ─── Admin: create/invite teacher ─────────────────────────────────────────
  async createTeacher(instituteId: string, adminId: string, dto: CreateTeacherDto) {
    // Email is globally unique in the users table, so check globally and surface
    // a clear conflict before Prisma throws.
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing?.isDeleted) {
      throw new ConflictException(
        'A deleted user with this email already exists. Use a different email.',
      );
    }
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const teacherRole = await this.prisma.role.findFirst({ where: { name: 'teacher' } });
    if (!teacherRole) throw new NotFoundException('Teacher role not seeded');

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        instituteId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash: hashedPassword,
        roleId: teacherRole.id,
        mustChangePassword: true,
        isEmailVerified: true, // teachers don't need email verification
      },
    });

    const teacher = await this.prisma.teacher.create({
      data: {
        instituteId,
        userId: user.id,
        assignedClasses: dto.assignedClasses,
      },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });

    // Email welcome — currently admin shares credentials manually (email service has no generic send)

    try {
      await this.auditLog.record({
        instituteId,
        userId: adminId,
        action: 'CREATE_TEACHER',
        targetId: teacher.id,
        targetType: 'teacher',
        newValues: { name: dto.name, email: dto.email },
      });
    } catch {}

    return { teacher, tempPassword };
  }

  // ─── Admin: list teachers ──────────────────────────────────────────────────
  async listTeachers(instituteId: string) {
    const teachers = await this.prisma.teacher.findMany({
      where: { instituteId, isDeleted: false },
      include: {
        user: { select: { name: true, email: true, phone: true, lastLoginAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return teachers;
  }

  // ─── Admin: update teacher ─────────────────────────────────────────────────
  async updateTeacher(
    instituteId: string,
    adminId: string,
    teacherId: string,
    dto: UpdateTeacherDto,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, instituteId, isDeleted: false },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    // Update user name/phone if provided
    if (dto.name !== undefined || dto.phone !== undefined) {
      await this.prisma.user.update({
        where: { id: teacher.userId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
      });
    }

    const updated = await this.prisma.teacher.update({
      where: { id: teacherId },
      data: {
        ...(dto.assignedClasses !== undefined
          ? { assignedClasses: dto.assignedClasses }
          : {}),
      },
      include: {
        user: { select: { name: true, email: true, phone: true, lastLoginAt: true } },
      },
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId: adminId,
        action: 'UPDATE_TEACHER',
        targetId: teacherId,
        targetType: 'teacher',
        newValues: dto as Record<string, unknown>,
      });
    } catch {}

    return updated;
  }

  // ─── Admin: delete (soft) teacher ─────────────────────────────────────────
  async deleteTeacher(instituteId: string, adminId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, instituteId, isDeleted: false },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const now = new Date();

    // Soft delete teacher + linked user and invalidate the session.
    await this.prisma.$transaction([
      this.prisma.teacher.update({
        where: { id: teacherId },
        data: { isDeleted: true, deletedAt: now, deletedBy: adminId },
      }),
      this.prisma.user.update({
        where: { id: teacher.userId },
        data: {
          isDeleted: true,
          isActive: false,
          deletedAt: now,
          deletedBy: adminId,
          sessionId: null,
        },
      }),
    ]);

    try {
      await this.auditLog.record({
        instituteId,
        userId: adminId,
        action: 'DELETE_TEACHER',
        targetId: teacherId,
        targetType: 'teacher',
      });
    } catch {}

    return { deleted: true };
  }

  // ─── Teacher: get own profile ──────────────────────────────────────────────
  async getTeacherProfile(instituteId: string, userId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { instituteId, userId, isDeleted: false },
      include: {
        user: { select: { name: true, email: true, phone: true } },
      },
    });
    if (!teacher) throw new NotFoundException('Teacher profile not found');
    return teacher;
  }

  // ─── Teacher: list students in assigned classes ────────────────────────────
  async getTeacherStudents(instituteId: string, userId: string) {
    const teacher = await this.getTeacherRecord(instituteId, userId);

    return this.prisma.student.findMany({
      where: {
        instituteId,
        isDeleted: false,
        class: { in: teacher.assignedClasses },
      },
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ class: 'asc' }, { user: { name: 'asc' } }],
    });
  }
}
