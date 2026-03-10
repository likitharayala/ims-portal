import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateQuestionsDto {
  @IsString()
  @MaxLength(200)
  topic!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  subject?: string;

  @IsEnum(['mcq', 'descriptive'])
  questionType!: 'mcq' | 'descriptive';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  count!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  marksPerQuestion?: number;
}
