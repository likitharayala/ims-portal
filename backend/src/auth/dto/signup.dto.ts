import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMinSize,
  IsEnum,
  Matches,
} from 'class-validator';
import { Feature } from '../../common/decorators/feature.decorator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, { message: 'Invalid phone number format' })
  phone: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  instituteName: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(Feature, { each: true })
  features: Feature[];
}
