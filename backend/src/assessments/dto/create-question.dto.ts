import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DifficultyLevel } from '@prisma/client';

export enum QuestionTypeEnum {
  MCQ = 'mcq',
  Descriptive = 'descriptive',
}

export class CreateQuestionDto {
  @IsEnum(QuestionTypeEnum)
  questionType: QuestionTypeEnum;

  @IsString()
  questionText: string;

  @IsOptional()
  @IsString()
  optionA?: string;

  @IsOptional()
  @IsString()
  optionB?: string;

  @IsOptional()
  @IsString()
  optionC?: string;

  @IsOptional()
  @IsString()
  optionD?: string;

  @IsOptional()
  @IsString()
  @IsIn(['A', 'B', 'C', 'D'])
  correctOption?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marks: number;

  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;
}
