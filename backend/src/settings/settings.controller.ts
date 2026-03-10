import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ─── Institute (admin) ────────────────────────────────────────────────
  @Get('admin/settings/institute')
  @Roles(Role.Admin)
  async getInstitute(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getInstitute(user.institute_id);
  }

  @Patch('admin/settings/institute')
  @Roles(Role.Admin)
  async updateInstitute(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateInstituteDto,
  ) {
    return this.settingsService.updateInstitute(user.institute_id, user.sub, dto);
  }

  // ─── Features (admin) ─────────────────────────────────────────────────
  @Get('admin/settings/features')
  @Roles(Role.Admin)
  async getFeatures(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getFeatures(user.institute_id);
  }

  @Patch('admin/settings/features')
  @Roles(Role.Admin)
  async updateFeatures(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateFeaturesDto,
  ) {
    return this.settingsService.updateFeatures(user.institute_id, user.sub, dto);
  }

  // ─── Features (student) ───────────────────────────────────────────────
  @Get('student/features')
  @Roles(Role.Student)
  async getStudentFeatures(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getFeatures(user.institute_id);
  }

  // ─── Profile (admin) ──────────────────────────────────────────────────
  @Get('admin/settings/profile')
  @Roles(Role.Admin)
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getAdminProfile(user.sub);
  }

  @Patch('admin/settings/profile')
  @Roles(Role.Admin)
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.settingsService.updateAdminProfile(user.sub, user.institute_id, dto);
  }
}
