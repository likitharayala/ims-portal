import { SetMetadata } from '@nestjs/common';

export enum Feature {
  Students = 'students',
  Materials = 'materials',
  Assessments = 'assessments',
  Payments = 'payments',
  AiGeneration = 'ai_generation',
}

export const FEATURE_KEY = 'feature';
export const RequiresFeature = (feature: Feature) =>
  SetMetadata(FEATURE_KEY, feature);
