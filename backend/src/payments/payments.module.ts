import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentCronService } from './cron/payment-cron.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentCronService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
