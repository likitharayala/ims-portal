import { SetMetadata } from '@nestjs/common';

export enum Role {
  Admin = 'admin',
  Student = 'student',
  Teacher = 'teacher',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
