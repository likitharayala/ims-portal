import {
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  Min,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionMarkDto {
  @IsString()
  questionId: string;

  @IsNumber()
  @Min(0)
  marks: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  flagged?: boolean;
}

export class EnterMarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionMarkDto)
  marks: QuestionMarkDto[];
}
