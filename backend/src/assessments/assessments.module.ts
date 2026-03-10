import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { SubmissionsService } from './submissions.service';
import { EvaluationService } from './evaluation.service';
import { AssessmentCronService } from './cron/assessment-cron.service';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    AiModule,
    NotificationsModule,
  ],
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    SubmissionsService,
    EvaluationService,
    AssessmentCronService,
  ],
})
export class AssessmentsModule {}
