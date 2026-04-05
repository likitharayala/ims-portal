import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MulterModule.register({ storage: undefined }), // memoryStorage (default)
    PaymentsModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
