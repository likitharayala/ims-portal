import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RequiresFeature, Feature } from '../common/decorators/feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // ─── Admin: list ─────────────────────────────────────────────────────
  @Get('admin/students')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  async listStudents(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListStudentsQueryDto,
  ) {
    return this.studentsService.listStudents(user.institute_id, query);
  }

  // ─── Admin: filter options ────────────────────────────────────────────
  @Get('admin/students/filter-options')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  async filterOptions(@CurrentUser() user: JwtPayload) {
    return this.studentsService.getFilterOptions(user.institute_id);
  }

  // ─── Admin: export ────────────────────────────────────────────────────
  @Get('admin/students/export')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  async exportStudents(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const buffer = await this.studentsService.exportStudents(user.institute_id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
    res.send(buffer);
  }

  // ─── Admin: bulk upload template ──────────────────────────────────────
  @Get('admin/students/bulk-upload/template')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  async getBulkTemplate(@Res() res: Response) {
    const buffer = await this.studentsService.getBulkUploadTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="students-template.xlsx"');
    res.send(buffer);
  }

  // ─── Admin: get one ───────────────────────────────────────────────────
  @Get('admin/students/:id')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  async getStudent(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.studentsService.getStudent(user.institute_id, id);
  }

  // ─── Admin: create ────────────────────────────────────────────────────
  @Post('admin/students')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  @HttpCode(HttpStatus.CREATED)
  async createStudent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStudentDto,
  ) {
    return this.studentsService.createStudent(user.institute_id, user.sub, dto);
  }

  // ─── Admin: bulk upload ───────────────────────────────────────────────
  @Post('admin/students/bulk-upload')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async bulkUpload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.studentsService.bulkUpload(user.institute_id, user.sub, file);
  }

  // ─── Admin: profile photo ─────────────────────────────────────────────
  @Post('admin/students/:id/profile-photo')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadProfilePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Photo file is required');
    return this.studentsService.uploadProfilePhoto(user.institute_id, id, file);
  }

  // ─── Admin: update ────────────────────────────────────────────────────
  @Put('admin/students/:id')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  async updateStudent(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.updateStudent(user.institute_id, user.sub, id, dto);
  }

  // ─── Admin: delete ────────────────────────────────────────────────────
  @Delete('admin/students/:id')
  @Roles(Role.Admin)
  @RequiresFeature(Feature.Students)
  @HttpCode(HttpStatus.OK)
  async deleteStudent(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.studentsService.deleteStudent(user.institute_id, user.sub, id);
    return { message: 'Student deleted' };
  }

  // ─── Student: self-profile ────────────────────────────────────────────
  @Get('student/profile')
  @Roles(Role.Student)
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.studentsService.getStudentProfile(user.sub);
  }

  @Put('student/profile')
  @Roles(Role.Student)
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { name?: string; phone?: string; address?: string; parentName?: string; parentPhone?: string },
  ) {
    return this.studentsService.updateStudentProfile(user.sub, dto);
  }
}
