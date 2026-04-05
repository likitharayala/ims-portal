import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';
import { UserProvisioningService } from '../users/services/user-provisioning.service';
import { AuthConfigService } from './services/auth-config.service';
import { AuthIdentityService } from './services/auth-identity.service';
import { LegacyAuthService } from './services/legacy-auth.service';
import { SupabaseAuthService } from './services/supabase-auth.service';
import { SupabaseTokenVerifierService } from './services/supabase-token-verifier.service';

describe('Auth module wiring', () => {
  it('resolves auth services with injected dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthConfigService,
        AuthIdentityService,
        LegacyAuthService,
        SupabaseAuthService,
        SupabaseTokenVerifierService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'DUAL_AUTH_ENABLED') return 'false';
              if (key === 'SUPABASE_ANON_KEY') return 'anon-key';
              if (key === 'SUPABASE_JWT_AUDIENCE') return 'authenticated';
              return undefined;
            }),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'SUPABASE_URL') return 'https://project-ref.supabase.co';
              if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
              if (key === 'JWT_SECRET') return 'jwt-secret';
              if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
              throw new Error(`Unexpected key ${key}`);
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {},
        },
        {
          provide: EmailService,
          useValue: {},
        },
        {
          provide: UserProvisioningService,
          useValue: {},
        },
      ],
    }).compile();

    expect(moduleRef.get(AuthConfigService)).toBeDefined();
    expect(moduleRef.get(LegacyAuthService)).toBeDefined();
    expect(moduleRef.get(SupabaseTokenVerifierService)).toBeDefined();
    expect(moduleRef.get(SupabaseAuthService)).toBeDefined();
    expect(moduleRef.get(AuthIdentityService)).toBeDefined();
  });
});
