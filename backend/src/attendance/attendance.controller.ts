import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AttendanceDateQueryDto, AttendanceReportQueryDto } from './dto/attendance-query.dto';

@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ─── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/attendance/filter-options')
  @Roles(Role.Admin)
  getFilterOptions(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.getFilterOptions(user.institute_id);
  }

  @Get('admin/attendance/report')
  @Roles(Role.Admin)
  monthlyReport(
    @CurrentUser() user: JwtPayload,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendanceService.monthlyReport(user.institute_id, query);
  }

  @Get('admin/attendance/export')
  @Roles(Role.Admin)
  async exportAttendance(
    @CurrentUser() user: JwtPayload,
    @Query() query: AttendanceReportQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceService.exportAttendance(user.institute_id, query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.xlsx"');
    res.send(buffer);
  }

  @Get('admin/attendance')
  @Roles(Role.Admin)
  listByDate(
    @CurrentUser() user: JwtPayload,
    @Query() query: AttendanceDateQueryDto,
  ) {
    return this.attendanceService.listByDate(user.institute_id, query);
  }

  @Post('admin/attendance/mark')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  markAttendance(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.markAttendance(user.institute_id, user.sub, dto);
  }

  // ─── Teacher ───────────────────────────────────────────────────────────────

  @Get('teacher/attendance')
  @Roles(Role.Teacher)
  teacherListByDate(
    @CurrentUser() user: JwtPayload,
    @Query() query: AttendanceDateQueryDto,
  ) {
    return this.attendanceService.listByDate(user.institute_id, query);
  }

  @Post('teacher/attendance/mark')
  @Roles(Role.Teacher)
  @HttpCode(HttpStatus.OK)
  teacherMarkAttendance(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.markAttendanceAsTeacher(
      user.institute_id,
      user.sub,
      dto,
    );
  }

  // ─── Student ───────────────────────────────────────────────────────────────

  @Get('student/attendance')
  @Roles(Role.Student)
  getMyAttendance(
    @CurrentUser() user: JwtPayload,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendanceService.getStudentAttendance(
      user.institute_id,
      user.sub,
      query,
    );
  }
}
