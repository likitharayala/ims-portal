import {
  IsIn,
  IsOptional,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendReminderDto {
  @IsIn(['all', 'pending_overdue', 'specific'])
  target: 'all' | 'pending_overdue' | 'specific';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds?: string[];

  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(500)
  message: string;
}
