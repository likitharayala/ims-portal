import { IsString, IsInt, IsOptional, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class GrantExtraTimeDto {
  @IsUUID()
  studentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  extraMinutes: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
