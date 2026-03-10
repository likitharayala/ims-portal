import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Controller()
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  // ─── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/teachers')
  @Roles(Role.Admin)
  listTeachers(@CurrentUser() user: JwtPayload) {
    return this.teachersService.listTeachers(user.institute_id);
  }

  @Post('admin/teachers')
  @Roles(Role.Admin)
  createTeacher(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTeacherDto,
  ) {
    return this.teachersService.createTeacher(user.institute_id, user.sub, dto);
  }

  @Put('admin/teachers/:id')
  @Roles(Role.Admin)
  updateTeacher(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.teachersService.updateTeacher(user.institute_id, user.sub, id, dto);
  }

  @Delete('admin/teachers/:id')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  deleteTeacher(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teachersService.deleteTeacher(user.institute_id, user.sub, id);
  }

  // ─── Teacher ───────────────────────────────────────────────────────────────

  @Get('teacher/profile')
  @Roles(Role.Teacher)
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.teachersService.getTeacherProfile(user.institute_id, user.sub);
  }

  @Get('teacher/students')
  @Roles(Role.Teacher)
  getStudents(@CurrentUser() user: JwtPayload) {
    return this.teachersService.getTeacherStudents(user.institute_id, user.sub);
  }
}
