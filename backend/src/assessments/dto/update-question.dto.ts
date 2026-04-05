import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  questionText?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marks?: number;
}
