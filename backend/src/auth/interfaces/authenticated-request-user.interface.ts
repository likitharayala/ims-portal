export type AuthProviderType = 'custom' | 'supabase';

export interface AuthenticatedRequestUser {
  sub: string;
  email: string;
  institute_id: string;
  role: string;
  auth_provider: AuthProviderType;
  session_id: string;
}
