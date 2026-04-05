import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin/dashboard/stats')
  @Roles(Role.Admin)
  getAdminStats(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getAdminStats(user.institute_id);
  }

  @Get('student/dashboard')
  @Roles(Role.Student)
  getStudentDashboard(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getStudentDashboard(user.institute_id, user.sub);
  }
}
