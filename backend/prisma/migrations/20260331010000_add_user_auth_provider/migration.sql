CREATE TYPE "AuthProvider" AS ENUM ('custom', 'supabase');

ALTER TABLE "users"
ADD COLUMN "auth_provider" "AuthProvider" NOT NULL DEFAULT 'custom',
ADD COLUMN "auth_migrated_at" TIMESTAMPTZ;
