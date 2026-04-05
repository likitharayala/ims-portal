import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequestUser } from '../interfaces/authenticated-request-user.interface';
import { SupabaseTokenClaims } from '../interfaces/supabase-token-claims.interface';
import { SupabaseTokenVerifierService } from './supabase-token-verifier.service';

interface SupabasePasswordSignInResponse {
  access_token?: string;
  refresh_token?: string;
}

export interface SupabaseIdentityMapping {
  identity: AuthenticatedRequestUser;
}

export interface SupabaseLoginResult {
  accessToken: string;
  refreshToken: string;
  identity: AuthenticatedRequestUser;
}

@Injectable()
export class SupabaseAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly supabaseTokenVerifier: SupabaseTokenVerifierService,
  ) {}

  async signIn(email: string, password: string): Promise<SupabaseLoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const payload = await this.requestTokenGrant('password', {
      email: normalizedEmail,
      password,
    });

    const identity = await this.validateSupabaseToken(payload.access_token);

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      identity,
    };
  }

  async refreshSession(refreshToken: string): Promise<SupabaseLoginResult> {
    const payload = await this.requestTokenGrant('refresh_token', {
      refresh_token: refreshToken,
    });

    const identity = await this.validateSupabaseToken(payload.access_token);

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      identity,
    };
  }

  async validateSupabaseToken(token: string): Promise<AuthenticatedRequestUser> {
    const claims = await this.supabaseTokenVerifier.verifyAccessToken(token);
    const { identity } = await this.mapSupabaseUser(claims);
    return identity;
  }

  async mapSupabaseUser(
    claims: SupabaseTokenClaims,
  ): Promise<SupabaseIdentityMapping> {
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        instituteId: true,
        authProvider: true,
        sessionId: true,
        isActive: true,
        isDeleted: true,
        role: {
          select: {
            name: true,
          },
        },
        institute: {
          select: {
            id: true,
            isActive: true,
          },
        },
      },
    });

    if (!user || user.isDeleted) {
      throw new UnauthorizedException('Supabase user is not mapped locally');
    }

    if (user.authProvider !== 'supabase') {
      throw new UnauthorizedException('User is not configured for Supabase auth');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    if (!user.institute || !user.instituteId || !user.institute.isActive) {
      throw new ForbiddenException('Institute relationship is invalid');
    }

    if (user.email.trim().toLowerCase() !== claims.email.trim().toLowerCase()) {
      throw new UnauthorizedException('Supabase token email does not match local user');
    }

    return {
      identity: {
        sub: user.id,
        email: user.email,
        institute_id: user.instituteId,
        role: user.role.name,
        auth_provider: 'supabase',
        session_id: claims.session_id,
      },
    };
  }

  private async requestTokenGrant(
    grantType: 'password' | 'refresh_token',
    body: Record<string, string>,
  ): Promise<Required<SupabasePasswordSignInResponse>> {
    const response = await fetch(this.getTokenGrantUrl(grantType), {
      method: 'POST',
      headers: {
        apikey: this.getClientApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = (await response.json()) as SupabasePasswordSignInResponse;
    if (!payload.access_token || !payload.refresh_token) {
      throw new UnauthorizedException('Supabase login failed');
    }

    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    };
  }

  private getTokenGrantUrl(grantType: 'password' | 'refresh_token'): string {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/+$/, '');
    return `${supabaseUrl}/auth/v1/token?grant_type=${grantType}`;
  }

  private getClientApiKey(): string {
    return this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
  }
}
