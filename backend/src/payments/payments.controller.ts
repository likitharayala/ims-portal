import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { BulkFeeUpdateDto } from './dto/bulk-fee-update.dto';
import { SendReminderDto } from './dto/send-reminder.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RequiresFeature, Feature } from '../common/decorators/feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { Response } from 'express';

@Controller('admin/payments')
@Roles(Role.Admin)
@RequiresFeature(Feature.Payments)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Static routes FIRST — before /:id — to prevent route conflicts

  @Get('filter-options')
  getFilterOptions(@CurrentUser() user: JwtPayload) {
    return this.paymentsService.getFilterOptions(user.institute_id);
  }

  @Get('overdue')
  listOverdue(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.paymentsService.listOverduePayments(user.institute_id, query);
  }

  @Get('export')
  async export(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListPaymentsQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.paymentsService.exportPayments(
      user.institute_id,
      query,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="payments.xlsx"',
    );
    res.send(buffer);
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.paymentsService.listPayments(user.institute_id, query);
  }

  @Post('bulk-fee-update')
  @HttpCode(HttpStatus.OK)
  bulkFeeUpdate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkFeeUpdateDto,
  ) {
    return this.paymentsService.bulkUpdateFee(
      user.institute_id,
      user.sub,
      dto,
    );
  }

  @Post('send-reminder')
  @HttpCode(HttpStatus.OK)
  sendReminder(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendReminderDto,
  ) {
    return this.paymentsService.sendReminder(
      user.institute_id,
      user.sub,
      dto,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updatePaymentStatus(
      user.institute_id,
      user.sub,
      id,
      dto,
    );
  }
}
