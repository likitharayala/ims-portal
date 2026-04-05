import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

const BCRYPT_ROUNDS = 12;
const TEMPORARY_PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const TEMPORARY_PASSWORD_LENGTH = 8;

@Injectable()
export class StudentCredentialsService {
  async createLockedPasswordHash(): Promise<string> {
    return bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  generateTemporaryPassword(): string {
    let password = '';

    for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index++) {
      password +=
        TEMPORARY_PASSWORD_CHARS[
          Math.floor(Math.random() * TEMPORARY_PASSWORD_CHARS.length)
        ];
    }

    return password;
  }

  createSessionId(): string {
    return randomUUID();
  }
}
