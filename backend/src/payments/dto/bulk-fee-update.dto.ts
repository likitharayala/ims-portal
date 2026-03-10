import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkFeeUpdateDto {
  @IsString()
  @IsNotEmpty()
  class: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeAmount: number;
}
