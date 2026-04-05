ALTER TABLE "users"
ADD COLUMN "pending_feature_ids" SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[],
ADD COLUMN "last_migration_error" TEXT,
ADD COLUMN "migration_retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_migration_attempt" TIMESTAMPTZ;
