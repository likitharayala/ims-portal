import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [
    MulterModule.register({}), // memoryStorage (default)
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
