import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SupabaseAdminUser {
  id: string;
  email?: string | null;
}

export type SupabaseInviteClassification = 'created' | 'existing';

export interface InviteUserOptions {
  redirectTo?: string;
  data?: Record<string, unknown>;
}

export interface SupabaseAdminInviteResult {
  user: SupabaseAdminUser;
  classification: SupabaseInviteClassification;
}

export interface SupabaseAdminDeleteResult {
  success: boolean;
}

export interface CreateUserOptions {
  password: string;
  emailConfirm?: boolean;
  userMetadata?: Record<string, unknown>;
}

export interface SupabaseAdminClient {
  inviteUserByEmail(email: string, options?: InviteUserOptions): Promise<SupabaseAdminInviteResult>;
  findUserByEmail(email: string): Promise<SupabaseAdminUser | null>;
  createUser(email: string, options: CreateUserOptions): Promise<SupabaseAdminUser>;
  deleteUser(userId: string): Promise<SupabaseAdminDeleteResult>;
}

export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');

class SupabaseAdminHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
  }
}

class SupabaseAdminHttpClient implements SupabaseAdminClient {
  private static readonly LIST_USERS_PAGE_SIZE = 200;

  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
  ) {}

  async inviteUserByEmail(
    email: string,
    options: InviteUserOptions = {},
  ): Promise<SupabaseAdminInviteResult> {
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      return { user: existingUser, classification: 'existing' };
    }

    let payload: any;
    try {
      payload = await this.request('/auth/v1/invite', {
        method: 'POST',
        body: JSON.stringify({
          email,
          redirect_to: options.redirectTo,
          data: options.data,
        }),
      });
    } catch (error) {
      if (this.isAlreadyRegisteredError(error)) {
        const alreadyExistingUser = await this.findUserByEmail(email);
        if (alreadyExistingUser) {
          return { user: alreadyExistingUser, classification: 'existing' };
        }
      }

      throw error;
    }

    const user = (payload?.user ?? payload) as SupabaseAdminUser | undefined;
    if (!user?.id) {
      throw new SupabaseAdminHttpError('Supabase invite did not return a user id');
    }

    return { user, classification: 'created' };
  }

  async findUserByEmail(email: string): Promise<SupabaseAdminUser | null> {
    const normalizedEmail = this.normalizeEmail(email);
    let page = 1;

    while (page > 0) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(SupabaseAdminHttpClient.LIST_USERS_PAGE_SIZE),
      });

      const payload = await this.request(`/auth/v1/admin/users?${params.toString()}`, {
        method: 'GET',
      });

      const users = Array.isArray(payload?.users)
        ? (payload.users as SupabaseAdminUser[])
        : [];
      const existingUser = users.find(
        (user) => this.normalizeEmail(user.email) === normalizedEmail,
      );

      if (existingUser) {
        return existingUser;
      }

      const nextPage =
        typeof payload?.nextPage === 'number'
          ? payload.nextPage
          : typeof payload?.next_page === 'number'
            ? payload.next_page
            : null;

      if (nextPage) {
        page = nextPage;
        continue;
      }

      if (users.length < SupabaseAdminHttpClient.LIST_USERS_PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    return null;
  }

  async deleteUser(userId: string): Promise<SupabaseAdminDeleteResult> {
    await this.request(`/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
    });

    return { success: true };
  }

  async createUser(email: string, options: CreateUserOptions): Promise<SupabaseAdminUser> {
    const payload = await this.request('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: this.normalizeEmail(email),
        password: options.password,
        email_confirm: options.emailConfirm ?? false,
        user_metadata: options.userMetadata,
      }),
    });

    const user = (payload?.user ?? payload) as SupabaseAdminUser | undefined;
    if (!user?.id) {
      throw new SupabaseAdminHttpError('Supabase admin createUser did not return a user');
    }

    return user;
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    const response = await fetch(new URL(path, this.supabaseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const responseText = await response.text();
    const payload = responseText ? this.safeJsonParse(responseText) : null;

    if (!response.ok) {
      const message =
        payload?.msg ??
        payload?.message ??
        payload?.error_description ??
        payload?.error ??
        `Supabase admin request failed with status ${response.status}`;
      throw new SupabaseAdminHttpError(message, response.status);
    }

    return payload;
  }

  private safeJsonParse(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return { message: value };
    }
  }

  private isAlreadyRegisteredError(error: unknown): boolean {
    if (!(error instanceof SupabaseAdminHttpError)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      error.statusCode === 400 ||
      error.statusCode === 409 ||
      error.statusCode === 422
    )
      ? message.includes('already')
      : false;
  }

  private normalizeEmail(email?: string | null): string {
    return (email ?? '').trim().toLowerCase();
  }
}

class DisabledSupabaseAdminClient implements SupabaseAdminClient {
  async inviteUserByEmail(): Promise<SupabaseAdminInviteResult> {
    throw new SupabaseAdminHttpError('Supabase provisioning is disabled');
  }

  async findUserByEmail(): Promise<SupabaseAdminUser | null> {
    return null;
  }

  async createUser(): Promise<SupabaseAdminUser> {
    throw new SupabaseAdminHttpError('Supabase provisioning is disabled');
  }

  async deleteUser(): Promise<SupabaseAdminDeleteResult> {
    throw new SupabaseAdminHttpError('Supabase provisioning is disabled');
  }
}

export const SupabaseAdminProvider: Provider = {
  provide: SUPABASE_ADMIN,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SupabaseAdminClient => {
    const provisioningEnabled =
      (config.get<string>('SUPABASE_PROVISIONING_ENABLED') ?? 'false').toLowerCase() === 'true';

    if (!provisioningEnabled) {
      return new DisabledSupabaseAdminClient();
    }

    return new SupabaseAdminHttpClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  },
};
