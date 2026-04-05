import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserProvisioningService } from '../users/services/user-provisioning.service';

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
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly userProvisioning: UserProvisioningService,
  ) {}

  private async getTeacherRecord(instituteId: string, userId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { instituteId, userId, isDeleted: false },
    });
    if (!teacher) throw new NotFoundException('Teacher profile not found');
    return teacher;
  }

  // Admin: create/invite teacher
  async createTeacher(instituteId: string, adminId: string, dto: CreateTeacherDto) {
    const teacherRole = await this.prisma.role.findFirst({ where: { name: 'teacher' } });
    if (!teacherRole) throw new NotFoundException('Teacher role not seeded');

    const normalizedEmail = dto.email.trim().toLowerCase();
    const provisioningResult = this.isSupabaseProvisioningEnabled()
      ? await this.createSupabaseTeacher(instituteId, teacherRole.id, dto, normalizedEmail)
      : await this.createLegacyTeacher(instituteId, teacherRole.id, dto, normalizedEmail);

    if (provisioningResult.status !== 'created' || !provisioningResult.payload) {
      throw new ConflictException('A user with this email already exists');
    }

    const { teacher, tempPassword, onboardingMethod } = provisioningResult.payload;

    try {
      await this.auditLog.record({
        instituteId,
        userId: adminId,
        action: 'CREATE_TEACHER',
        targetId: teacher.id,
        targetType: 'teacher',
        newValues: { name: dto.name, email: dto.email, onboardingMethod },
      });
    } catch {}

    return { teacher, tempPassword, onboardingMethod };
  }

  // Admin: list teachers
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

  // Admin: update teacher
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

  // Admin: delete (soft) teacher
  async deleteTeacher(instituteId: string, adminId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, instituteId, isDeleted: false },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const now = new Date();

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

  // Teacher: get own profile
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

  // Teacher: list students in assigned classes
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

  private async createSupabaseTeacher(
    instituteId: string,
    teacherRoleId: number,
    dto: CreateTeacherDto,
    normalizedEmail: string,
  ) {
    const placeholderPasswordHash = await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS);

    return this.userProvisioning.provisionInvitedUser({
      action: 'teacher_provision',
      email: normalizedEmail,
      instituteId,
      redirectTo: this.getSupabaseInviteRedirectUrl(),
      metadata: {
        instituteId,
        role: 'teacher',
      },
      writeLocal: async (tx, authUser, email) => {
        const user = await tx.user.create({
          data: {
            id: authUser.id,
            instituteId,
            name: dto.name,
            email,
            phone: dto.phone,
            authProvider: 'supabase',
            authMigratedAt: null,
            passwordHash: placeholderPasswordHash,
            roleId: teacherRoleId,
            mustChangePassword: false,
            isEmailVerified: false,
          } as any,
        });

        const teacher = await tx.teacher.create({
          data: {
            instituteId,
            userId: user.id,
            assignedClasses: dto.assignedClasses,
          },
          include: { user: { select: { name: true, email: true, phone: true } } },
        });

        return {
          appUser: user,
          payload: {
            teacher,
            tempPassword: null,
            onboardingMethod: 'supabase_invite' as const,
          },
        };
      },
    });
  }

  private async createLegacyTeacher(
    instituteId: string,
    teacherRoleId: number,
    dto: CreateTeacherDto,
    normalizedEmail: string,
  ) {
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          instituteId,
          name: dto.name,
          email: normalizedEmail,
          phone: dto.phone,
          authProvider: 'custom',
          authMigratedAt: null,
          passwordHash: hashedPassword,
          roleId: teacherRoleId,
          mustChangePassword: true,
          isEmailVerified: true,
        } as any,
      });

      const teacher = await tx.teacher.create({
        data: {
          instituteId,
          userId: user.id,
          assignedClasses: dto.assignedClasses,
        },
        include: { user: { select: { name: true, email: true, phone: true } } },
      });

      return {
        status: 'created' as const,
        userId: user.id,
        payload: {
          teacher,
          tempPassword,
          onboardingMethod: 'manual_temp_password' as const,
        },
      };
    });
  }

  private isSupabaseProvisioningEnabled(): boolean {
    return (this.config.get<string>('SUPABASE_PROVISIONING_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  private getSupabaseInviteRedirectUrl(): string {
    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    return `${frontendUrl}/auth/complete-invite`;
  }
}
