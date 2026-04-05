export interface SupabaseTokenClaims {
  sub: string;
  email: string;
  session_id: string;
  iss: string;
  aud?: string | string[];
  exp: number;
  iat?: number;
}
