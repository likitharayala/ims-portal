import { IsObject, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class FeaturesMap {
  @IsOptional()
  @IsBoolean()
  students?: boolean;

  @IsOptional()
  @IsBoolean()
  materials?: boolean;

  @IsOptional()
  @IsBoolean()
  assessments?: boolean;

  @IsOptional()
  @IsBoolean()
  payments?: boolean;

  @IsOptional()
  @IsBoolean()
  ai_generation?: boolean;
}

export class UpdateFeaturesDto {
  @IsObject()
  @Type(() => FeaturesMap)
  features: FeaturesMap;
}
