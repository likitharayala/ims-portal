import {
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  // email is intentionally excluded — cannot be changed

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  class?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  school?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  rollNumber?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  parentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  parentPhone?: string;

  @IsOptional()
  @IsDateString()
  joinedDate?: string;
}
