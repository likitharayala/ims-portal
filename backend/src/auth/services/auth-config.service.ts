import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthConfigService {
  constructor(private readonly config: ConfigService) {}

  isDualAuthEnabled(): boolean {
    return (this.config.get<string>('DUAL_AUTH_ENABLED') ?? 'false').toLowerCase() === 'true';
  }
}
