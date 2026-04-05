import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { ListMaterialsQueryDto } from './dto/list-materials-query.dto';

const PAGE_SIZE = 20;

const materialSelect = {
  id: true,
  title: true,
  subject: true,
  author: true,
  description: true,
  filePath: true,
  fileSize: true,
  isHidden: true,
  uploadedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly fileUpload: FileUploadService,
  ) {}

  // ─── Admin: create ─────────────────────────────────────────────────────
  async createMaterial(
    instituteId: string,
    userId: string,
    dto: CreateMaterialDto,
    file: Express.Multer.File,
  ) {
    const saved = await this.fileUpload.saveMaterialFile(instituteId, file);

    const material = await this.prisma.studyMaterial.create({
      data: {
        instituteId,
        title: dto.title,
        subject: dto.subject,
        author: dto.author,
        description: dto.description,
        filePath: saved.filePath,
        fileSize: saved.fileSize,
        uploadedBy: userId,
      },
      select: materialSelect,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'CREATE_MATERIAL',
        targetId: material.id,
        targetType: 'study_material',
        newValues: { title: dto.title, subject: dto.subject },
      });
    } catch {}

    return material;
  }

  // ─── Admin: list (all, including hidden) ──────────────────────────────
  async listMaterialsAdmin(instituteId: string, query: ListMaterialsQueryDto) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = { instituteId, isDeleted: false };

    if (query.subject) where.subject = query.subject;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
        { author: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = query.sort === 'oldest'
      ? { createdAt: 'asc' as const }
      : { createdAt: 'desc' as const };

    const [data, total] = await Promise.all([
      this.prisma.studyMaterial.findMany({
        where,
        select: materialSelect,
        orderBy,
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.studyMaterial.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─── Student: list (visible only) ────────────────────────────────────
  async listMaterialsStudent(instituteId: string, query: ListMaterialsQueryDto) {
    const page = query.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const where: any = { instituteId, isDeleted: false, isHidden: false };

    if (query.subject) where.subject = query.subject;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
        { author: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = query.sort === 'oldest'
      ? { createdAt: 'asc' as const }
      : { createdAt: 'desc' as const };

    const [data, total] = await Promise.all([
      this.prisma.studyMaterial.findMany({
        where,
        select: materialSelect,
        orderBy,
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.studyMaterial.count({ where }),
    ]);

    return { data, meta: { total, page, pageSize: PAGE_SIZE } };
  }

  // ─── Get one (scoped by institute — IDOR protection) ──────────────────
  async getMaterial(instituteId: string, id: string, studentVisible = false) {
    const where: any = { id, instituteId, isDeleted: false };
    if (studentVisible) where.isHidden = false;

    const material = await this.prisma.studyMaterial.findFirst({
      where,
      select: materialSelect,
    });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  // ─── Admin: update metadata ───────────────────────────────────────────
  async updateMaterial(
    instituteId: string,
    userId: string,
    id: string,
    dto: UpdateMaterialDto,
    file?: Express.Multer.File,
  ) {
    const existing = await this.prisma.studyMaterial.findFirst({
      where: { id, instituteId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Material not found');

    let fileUpdates: { filePath?: string; fileSize?: number } = {};

    if (file) {
      const saved = await this.fileUpload.saveMaterialFile(instituteId, file);
      fileUpdates = { filePath: saved.filePath, fileSize: saved.fileSize };
      // Delete old file
      this.fileUpload.deleteFile(existing.filePath);
    }

    const updated = await this.prisma.studyMaterial.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.author !== undefined && { author: dto.author }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...fileUpdates,
      },
      select: materialSelect,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'UPDATE_MATERIAL',
        targetId: id,
        targetType: 'study_material',
        newValues: dto as Record<string, unknown>,
      });
    } catch {}

    return updated;
  }

  // ─── Admin: toggle hidden ─────────────────────────────────────────────
  async toggleHidden(instituteId: string, userId: string, id: string) {
    const existing = await this.prisma.studyMaterial.findFirst({
      where: { id, instituteId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Material not found');

    const updated = await this.prisma.studyMaterial.update({
      where: { id },
      data: { isHidden: !existing.isHidden },
      select: materialSelect,
    });

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: updated.isHidden ? 'HIDE_MATERIAL' : 'SHOW_MATERIAL',
        targetId: id,
        targetType: 'study_material',
      });
    } catch {}

    return updated;
  }

  // ─── Admin: delete (soft) ─────────────────────────────────────────────
  async deleteMaterial(instituteId: string, userId: string, id: string) {
    const existing = await this.prisma.studyMaterial.findFirst({
      where: { id, instituteId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Material not found');

    await this.prisma.studyMaterial.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    // Delete physical file
    this.fileUpload.deleteFile(existing.filePath);

    try {
      await this.auditLog.record({
        instituteId,
        userId,
        action: 'DELETE_MATERIAL',
        targetId: id,
        targetType: 'study_material',
      });
    } catch {}
  }

  // ─── Get distinct subjects ────────────────────────────────────────────
  async getSubjects(instituteId: string, visibleOnly = false) {
    const where: any = { instituteId, isDeleted: false };
    if (visibleOnly) where.isHidden = false;

    const rows = await this.prisma.studyMaterial.findMany({
      where,
      select: { subject: true },
      distinct: ['subject'],
      orderBy: { subject: 'asc' },
    });
    return rows.map((r) => r.subject);
  }

  // ─── Serve file (auth-gated, institute-scoped) ────────────────────────
  getFilePath(instituteId: string, material: { filePath: string; instituteId?: string }) {
    // Ensure file belongs to this institute
    if (!material.filePath.startsWith(`/${instituteId}/`)) {
      throw new ForbiddenException('Access denied');
    }
    return this.fileUpload.getAbsolutePath(material.filePath);
  }
}
