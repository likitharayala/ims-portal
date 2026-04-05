import { IsObject, IsOptional } from 'class-validator';

// answers: { [questionId]: { selectedOption?: 'A'|'B'|'C'|'D', text?: string } }
export class SaveAnswersDto {
  @IsOptional()
  @IsObject()
  answers?: Record<string, { selectedOption?: string; text?: string }>;
}
