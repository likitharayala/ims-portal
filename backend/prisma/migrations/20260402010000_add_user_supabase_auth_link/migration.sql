ALTER TABLE "users"
ADD COLUMN "supabase_auth_id" UUID,
ADD COLUMN "auth_migration_status" VARCHAR(20);

CREATE UNIQUE INDEX "users_supabase_auth_id_key" ON "users"("supabase_auth_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_supabase_auth_id_fkey"
FOREIGN KEY ("supabase_auth_id") REFERENCES "auth"."users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
