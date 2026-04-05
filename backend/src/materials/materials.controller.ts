import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { ListMaterialsQueryDto } from './dto/list-materials-query.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RequiresFeature, Feature } from '../common/decorators/feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller()
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  // ─── Admin: subjects ──────────────────────────────────────────────────
  @Get('admin/materials/subjects')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  getAdminSubjects(@CurrentUser() user: JwtPayload) {
    return this.materialsService.getSubjects(user.institute_id, false);
  }

  // ─── Admin: list ──────────────────────────────────────────────────────
  @Get('admin/materials')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  listAdmin(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMaterialsQueryDto,
  ) {
    return this.materialsService.listMaterialsAdmin(user.institute_id, query);
  }

  // ─── Admin: get one ───────────────────────────────────────────────────
  @Get('admin/materials/:id')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  getOneAdmin(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.materialsService.getMaterial(user.institute_id, id, false);
  }

  // ─── Admin: upload ────────────────────────────────────────────────────
  @Post('admin/materials')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  createMaterial(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMaterialDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.materialsService.createMaterial(user.institute_id, user.sub, dto, file);
  }

  // ─── Admin: update metadata (+ optional file replace) ────────────────
  @Put('admin/materials/:id')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  updateMaterial(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.materialsService.updateMaterial(
      user.institute_id,
      user.sub,
      id,
      dto,
      file,
    );
  }

  // ─── Admin: toggle hidden ─────────────────────────────────────────────
  @Patch('admin/materials/:id/toggle-hidden')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  toggleHidden(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.materialsService.toggleHidden(user.institute_id, user.sub, id);
  }

  // ─── Admin: delete ────────────────────────────────────────────────────
  @Delete('admin/materials/:id')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Materials)
  @HttpCode(HttpStatus.OK)
  async deleteMaterial(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.materialsService.deleteMaterial(user.institute_id, user.sub, id);
    return { message: 'Material deleted' };
  }

  // ─── Student: subjects ────────────────────────────────────────────────
  @Get('student/materials/subjects')
  @Roles(Role.Student)
  @RequiresFeature(Feature.Materials)
  getStudentSubjects(@CurrentUser() user: JwtPayload) {
    return this.materialsService.getSubjects(user.institute_id, true);
  }

  // ─── Student: list ────────────────────────────────────────────────────
  @Get('student/materials')
  @Roles(Role.Student)
  @RequiresFeature(Feature.Materials)
  listStudent(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMaterialsQueryDto,
  ) {
    return this.materialsService.listMaterialsStudent(user.institute_id, query);
  }

  // ─── Student: get one ─────────────────────────────────────────────────
  @Get('student/materials/:id')
  @Roles(Role.Student)
  @RequiresFeature(Feature.Materials)
  getOneStudent(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.materialsService.getMaterial(user.institute_id, id, true);
  }

  // ─── Shared: serve file (admin + student) ────────────────────────────
  @Get('materials/:id/file')
  async serveFile(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Works for both roles — just needs valid JWT + same institute
    const material = await this.materialsService.getMaterial(
      user.institute_id,
      id,
      user.role === 'student',
    );

    const filePath = this.materialsService.getFilePath(user.institute_id, material);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found on server');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${material.title}.pdf"`);
    fs.createReadStream(filePath).pipe(res as any);
  }
}
