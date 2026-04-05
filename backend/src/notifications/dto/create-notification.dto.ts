import { IsEnum, IsOptional, IsString, MaxLength, IsArray, IsUUID } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsString()
  @MaxLength(100)
  title!: string;

  @IsString()
  @MaxLength(500)
  message!: string;

  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType;

  @IsEnum(['all', 'specific'])
  target!: 'all' | 'specific';

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  studentIds?: string[];
}
