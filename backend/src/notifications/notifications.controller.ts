import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/notifications')
  @Roles(Role.Admin)
  listAdminNotifications(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listAdminNotifications(user.institute_id, query);
  }

  @Post('admin/notifications')
  @Roles(Role.Admin)
  createNotification(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationsService.createNotification(user.institute_id, user.sub, dto);
  }

  @Delete('admin/notifications')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  deleteAllNotifications(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.deleteAllNotifications(user.institute_id, user.sub);
  }

  @Delete('admin/notifications/:id')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  deleteNotification(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.deleteNotification(user.institute_id, user.sub, id);
  }

  // ─── Student ───────────────────────────────────────────────────────────────

  @Get('student/notifications/unread-count')
  @Roles(Role.Student)
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getUnreadCount(user.institute_id, user.sub);
  }

  @Get('student/notifications')
  @Roles(Role.Student)
  getMyNotifications(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getStudentNotifications(user.institute_id, user.sub);
  }

  @Patch('student/notifications/:id/read')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(user.institute_id, user.sub, id);
  }

  @Patch('student/notifications/:id/dismiss')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.OK)
  dismiss(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.dismissNotification(user.institute_id, user.sub, id);
  }

  @Post('student/notifications/dismiss-all')
  @Roles(Role.Student)
  @HttpCode(HttpStatus.OK)
  dismissAll(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.dismissAll(user.institute_id, user.sub);
  }
}
