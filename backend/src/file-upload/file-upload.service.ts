import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface SavedFile {
  filePath: string; // relative path stored in DB e.g. /{instituteId}/materials/{id}.pdf
  fileSize: number; // bytes
  originalName: string;
}

const ALLOWED_MATERIAL_MIMES = ['application/pdf'];
const ALLOWED_MATERIAL_EXTS = ['.pdf'];
const MAX_MATERIAL_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png'];
const ALLOWED_PHOTO_EXTS = ['.jpg', '.jpeg', '.png'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

@Injectable()
export class FileUploadService {
  private readonly uploadsRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsRoot = path.resolve(process.cwd(), 'uploads');
    // Ensure uploads root exists
    if (!fs.existsSync(this.uploadsRoot)) {
      fs.mkdirSync(this.uploadsRoot, { recursive: true });
    }
  }

  // ─── Validate material file ───────────────────────────────────────────
  validateMaterialFile(file: Express.Multer.File): void {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MATERIAL_MIMES.includes(file.mimetype) || !ALLOWED_MATERIAL_EXTS.includes(ext)) {
      throw new BadRequestException('Only PDF files are allowed for study materials');
    }
    if (file.size > MAX_MATERIAL_SIZE) {
      throw new BadRequestException('File size must not exceed 50MB');
    }
  }

  // ─── Validate profile photo ───────────────────────────────────────────
  validatePhotoFile(file: Express.Multer.File): void {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_PHOTO_MIMES.includes(file.mimetype) || !ALLOWED_PHOTO_EXTS.includes(ext)) {
      throw new BadRequestException('Only JPG and PNG files are allowed for profile photos');
    }
    if (file.size > MAX_PHOTO_SIZE) {
      throw new BadRequestException('Photo size must not exceed 5MB');
    }
  }

  // ─── Save material PDF ────────────────────────────────────────────────
  async saveMaterialFile(
    instituteId: string,
    file: Express.Multer.File,
  ): Promise<SavedFile> {
    this.validateMaterialFile(file);

    const id = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    const relativePath = `/${instituteId}/materials/${id}${ext}`;
    const absoluteDir = path.join(this.uploadsRoot, instituteId, 'materials');
    const absolutePath = path.join(this.uploadsRoot, instituteId, 'materials', `${id}${ext}`);

    fs.mkdirSync(absoluteDir, { recursive: true });
    fs.writeFileSync(absolutePath, file.buffer);

    return {
      filePath: relativePath,
      fileSize: file.size,
      originalName: file.originalname,
    };
  }

  // ─── Save profile photo ───────────────────────────────────────────────
  async saveProfilePhoto(
    instituteId: string,
    studentId: string,
    file: Express.Multer.File,
  ): Promise<SavedFile> {
    this.validatePhotoFile(file);

    const ext = path.extname(file.originalname).toLowerCase();
    const relativePath = `/${instituteId}/profiles/${studentId}${ext}`;
    const absoluteDir = path.join(this.uploadsRoot, instituteId, 'profiles');
    const absolutePath = path.join(this.uploadsRoot, instituteId, 'profiles', `${studentId}${ext}`);

    fs.mkdirSync(absoluteDir, { recursive: true });
    fs.writeFileSync(absolutePath, file.buffer);

    return {
      filePath: relativePath,
      fileSize: file.size,
      originalName: file.originalname,
    };
  }

  // ─── Get absolute path for a stored file ─────────────────────────────
  getAbsolutePath(relativePath: string): string {
    // relativePath: /{instituteId}/materials/{id}.pdf
    const safe = relativePath.replace(/\.\./g, '').replace(/\\/g, '/');
    return path.join(this.uploadsRoot, safe);
  }

  // ─── Delete file from disk ────────────────────────────────────────────
  deleteFile(relativePath: string): void {
    try {
      const abs = this.getAbsolutePath(relativePath);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // Non-fatal — file may already be gone
    }
  }

  // ─── Check file exists ────────────────────────────────────────────────
  fileExists(relativePath: string): boolean {
    return fs.existsSync(this.getAbsolutePath(relativePath));
  }
}
