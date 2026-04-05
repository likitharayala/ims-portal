import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { PaymentsModule } from '../payments/payments.module';
import { StudentOnboardingAuditService } from './student-onboarding-audit.service';
import { StudentCredentialsService } from './student-credentials.service';
import { StudentOnboardingService } from './student-onboarding.service';
import { StudentOnboardingProcessor } from './processors/student-onboarding.processor';
import { STUDENT_ONBOARDING_QUEUE } from './students.constants';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MulterModule.register({ storage: undefined }), // memoryStorage (default)
    BullModule.registerQueue({
      name: STUDENT_ONBOARDING_QUEUE,
    }),
    PaymentsModule,
    UsersModule,
  ],
  controllers: [StudentsController],
  providers: [
    StudentsService,
    StudentOnboardingAuditService,
    StudentCredentialsService,
    StudentOnboardingService,
    StudentOnboardingProcessor,
  ],
})
export class StudentsModule {}
