import { IsArray, IsEmail, IsOptional, IsString, MaxLength, ArrayNotEmpty } from 'class-validator';

export class CreateTeacherDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  assignedClasses!: string[];
}
