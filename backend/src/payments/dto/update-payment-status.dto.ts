import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePaymentStatusDto {
  @IsIn(['pending', 'paid', 'overdue'])
  status: 'pending' | 'paid' | 'overdue';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
