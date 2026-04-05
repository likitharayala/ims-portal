# Skill: create-migration

## Purpose

Safely design and generate a Prisma database migration for Teachly. Ensures schema changes respect all non-negotiable rules (multi-tenancy, soft delete, UUID PKs, CHECK constraints, partial indexes) and are safe to apply to a live PostgreSQL database without downtime.

## When to Use

- Adding a new table to the schema
- Adding or modifying columns on an existing table
- Adding indexes to improve query performance
- Backfilling data as part of a schema change
- After the `db-architect` agent has produced a schema design

---

## Workflow

### Step 1 — Read the current schema

```
backend/prisma/schema.prisma
```

Understand:
- Existing models the new model will relate to
- Existing enums to reuse (don't duplicate enum values)
- Existing naming conventions (camelCase fields, PascalCase models)

### Step 2 — Validate the schema change against non-negotiables

Before writing any Prisma model, verify every item:

**New table checklist:**
- [ ] `id String @id @default(uuid())` — UUID PK, no integers
- [ ] `instituteId String` with `@relation` to `Institute` — every non-lookup table
- [ ] `isDeleted Boolean @default(false)`, `deletedAt DateTime?`, `deletedBy String?`
- [ ] `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- [ ] All string columns have `@db.VarChar(N)` — no unbounded TEXT where length is known
- [ ] Status/type fields use Prisma `enum` — generates PostgreSQL CHECK constraint
- [ ] `@@index([instituteId, isDeleted])` — minimum index on every tenant table

**Modifying existing table checklist:**
- [ ] New NOT NULL column has a `@default(...)` — otherwise migration fails on existing rows
- [ ] Renaming a column = 3-step migration (add → backfill → drop), not a single rename
- [ ] Never `DROP COLUMN` in the same migration that removes usage from code

### Step 3 — Write the Prisma schema change

Add or modify the model in `backend/prisma/schema.prisma`.

**Example — new table:**
```prisma
enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
}

model Attendance {
  id          String           @id @default(uuid())
  instituteId String
  institute   Institute        @relation(fields: [instituteId], references: [id])
  studentId   String
  student     Student          @relation(fields: [studentId], references: [id])
  date        DateTime
  status      AttendanceStatus
  note        String?          @db.VarChar(500)

  isDeleted   Boolean          @default(false)
  deletedAt   DateTime?
  deletedBy   String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@index([instituteId, isDeleted])
  @@index([instituteId, studentId, date])
}
```

### Step 4 — Generate the migration (dry run first)

```bash
cd backend

# Preview what SQL will be generated — do NOT apply yet
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Then generate the actual migration file:

```bash
npx prisma migrate dev --name <descriptive_name> --create-only
```

Use descriptive names:
- `add_attendance_table`
- `add_reference_to_payments`
- `add_full_text_index_students`

> `--create-only` creates the SQL file without applying it — review before running.

### Step 5 — Edit the migration SQL to add advanced indexes

Open the generated migration file at:
```
backend/prisma/migrations/<timestamp>_<name>/migration.sql
```

Append the following after the `CREATE TABLE` statement:

**Partial index (most queries filter `isDeleted = false`):**
```sql
CREATE INDEX idx_attendance_institute
  ON "Attendance"("instituteId", "date" DESC)
  WHERE "isDeleted" = false;
```

**Full-text search (use 'simple', not 'english'):**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_students_search
  ON "Student" USING GIN (to_tsvector('simple', "name" || ' ' || COALESCE("email", '')))
  WHERE "isDeleted" = false;
```

**Trigram index for phone search:**
```sql
CREATE INDEX idx_students_phone_trgm
  ON "Student" USING GIN ("phone" gin_trgm_ops)
  WHERE "isDeleted" = false AND "phone" IS NOT NULL;
```

**Rules — do NOT create:**
- GIN indexes on JSONB fields that are never searched
- Indexes on boolean columns alone (very low cardinality)
- Duplicate indexes that are already covered by a composite index

### Step 6 — Apply and verify

```bash
# Apply the migration
cd backend && npx prisma migrate dev

# Verify schema is in sync
npx prisma validate

# Regenerate Prisma client
npx prisma generate
```

Check the output — Prisma must report `Your database is now in sync with your schema.`

### Step 7 — Data migration (if needed)

If existing rows need to be updated as part of the schema change, add a data migration step inside the same SQL file, after the DDL changes:

```sql
-- Backfill new column from existing data
UPDATE "Payment"
SET "reference" = ''
WHERE "reference" IS NULL;

-- Then make it NOT NULL in the same migration if needed
ALTER TABLE "Payment" ALTER COLUMN "reference" SET NOT NULL;
```

---

## Migration Safety Rules

| Scenario | Safe approach |
|---|---|
| Add nullable column | Safe — no default needed |
| Add NOT NULL column | Must provide `@default(...)` in Prisma schema |
| Rename a column | 3-step: add new → backfill → drop old (separate migrations) |
| Drop a column | Remove from code first → deploy → then drop in a separate migration |
| Add an index | Always use `CREATE INDEX CONCURRENTLY` in production (no table lock) |
| Add a CHECK constraint | Validate existing rows first — constraint will fail if rows violate it |
| Backfill large table | Batch update: `UPDATE ... WHERE id IN (SELECT id ... LIMIT 1000)` in a loop |

> In development, standard `CREATE INDEX` is fine. In production migrations, add `CONCURRENTLY`.

---

## Checklist

- [ ] Prisma schema passes `npx prisma validate`
- [ ] New NOT NULL columns have `@default(...)` values
- [ ] Migration SQL reviewed before applying (not just auto-applied)
- [ ] Partial indexes added manually to migration SQL file
- [ ] `CREATE INDEX CONCURRENTLY` used for any index on a table with existing data
- [ ] `npx prisma generate` run after migration to update the client
- [ ] No `DROP COLUMN` in the same migration that stops using the column in code
- [ ] No plain `TIMESTAMP` — always `TIMESTAMPTZ` (Prisma's `DateTime` maps to this)

---

## Expected Output

```
backend/prisma/schema.prisma            ✅ new model or column added
backend/prisma/migrations/
  <timestamp>_<name>/
    migration.sql                       ✅ DDL + manually added partial/GIN indexes

Prisma output:
  ✔  Your database is now in sync with your schema.
  ✔  Generated Prisma Client
```
