import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsDateString,
  IsEnum,
  IsObject,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionTypePreference } from '@prisma/client';

export class CreateAssessmentDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  totalMarks: number;

  @IsOptional()
  @IsBoolean()
  negativeMarking?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  negativeValue?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsEnum(QuestionTypePreference)
  questionTypePreference?: QuestionTypePreference;

  @IsOptional()
  @IsObject()
  difficultyDistribution?: { easy?: number; medium?: number; hard?: number };
}
