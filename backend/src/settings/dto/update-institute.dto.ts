import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInstituteDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
  // email: not allowed in V1
}
