import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequestUser,
  AuthProviderType,
} from '../../auth/interfaces/authenticated-request-user.interface';

type CurrentUserSource = Partial<AuthenticatedRequestUser> & {
  userId?: string;
  iat?: number;
  exp?: number;
};

export interface JwtPayload extends AuthenticatedRequestUser {
  userId?: string;
  iat?: number;
  exp?: number;
}

const DEFAULT_AUTH_PROVIDER: AuthProviderType = 'custom';

export function normalizeCurrentUser(user: CurrentUserSource | null | undefined): JwtPayload {
  const rawUser = user ?? {};
  const sub = rawUser.sub ?? rawUser.userId ?? '';

  return {
    ...rawUser,
    sub,
    email: rawUser.email ?? '',
    institute_id: rawUser.institute_id ?? '',
    role: rawUser.role ?? '',
    auth_provider: rawUser.auth_provider ?? DEFAULT_AUTH_PROVIDER,
    session_id: rawUser.session_id ?? '',
  };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return normalizeCurrentUser(request.user);
  },
);
