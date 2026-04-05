import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AttendanceDateQueryDto {
  @IsDateString()
  date!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  class?: string;
}

export class AttendanceReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year?: number;

  @IsOptional()
  @IsString()
  class?: string;
}
