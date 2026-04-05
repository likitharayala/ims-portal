import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthConfigService } from './services/auth-config.service';
import { AuthIdentityService } from './services/auth-identity.service';
import { LegacyAuthService } from './services/legacy-auth.service';
import { SupabaseAuthService } from './services/supabase-auth.service';
import { SupabaseTokenVerifierService } from './services/supabase-token-verifier.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PassportModule, UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthConfigService,
    AuthIdentityService,
    LegacyAuthService,
    SupabaseAuthService,
    SupabaseTokenVerifierService,
    JwtStrategy,
  ],
  exports: [
    AuthService,
    AuthConfigService,
    AuthIdentityService,
    LegacyAuthService,
    SupabaseAuthService,
    SupabaseTokenVerifierService,
  ],
})
export class AuthModule {}
