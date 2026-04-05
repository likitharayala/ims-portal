# Skill: schema-review

## Purpose

Audit the Teachly Prisma schema against all non-negotiable architecture rules. Identify missing indexes, unsafe column definitions, constraint gaps, and query anti-patterns before they cause production issues.

## When to Use

- Before merging a PR that touches `prisma/schema.prisma`
- After the `db-architect` agent produces a schema design (to validate it)
- When a slow query is reported and the root cause may be a missing index
- Periodically as the schema grows, to catch accumulated technical debt

---

## Workflow

### Step 1 — Read the full schema

```
backend/prisma/schema.prisma
```

Build a mental map of:
- All models and their relations
- All enums
- All existing `@@index` definitions

### Step 2 — Check every model against the rules

For each model, run through the following checklist.

#### 2a. Structural rules (non-negotiable)

| Rule | Check |
|---|---|
| UUID PK | `id String @id @default(uuid())` — no integer IDs |
| instituteId | Every non-lookup table has `instituteId String` with `@relation` to `Institute` |
| Soft delete | Every mutable table has `isDeleted Boolean @default(false)`, `deletedAt DateTime?`, `deletedBy String?` |
| Timestamps | `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` |
| String limits | All `String` columns that map to user input have `@db.VarChar(N)` — flag any that don't |
| Enum fields | Status/type columns use Prisma `enum`, not raw `String` — flag `String` columns named `status`, `type`, `role` |
| Boolean defaults | All `Boolean` columns have `@default(...)` — never nullable booleans |

**Lookup tables exempt from `instituteId` and soft delete:**
- `Role`, `Feature`, `Institute` (the root entity itself)
- Any static reference table that is never mutated by users

#### 2b. Index audit

For each table, verify the minimum required indexes:

**Required on every tenant table:**
```prisma
@@index([instituteId, isDeleted])
```

**Required if the table has a list endpoint that sorts by time:**
```sql
-- Check migration SQL for:
CREATE INDEX idx_<table>_created ON "<Table>"("instituteId", "createdAt" DESC)
  WHERE "isDeleted" = false;
```

**Required if the table is searched by name/email:**
```sql
-- GIN full-text index using 'simple' language (not 'english')
CREATE INDEX idx_<table>_search ON "<Table>"
  USING GIN (to_tsvector('simple', "name" || ' ' || COALESCE("email", '')))
  WHERE "isDeleted" = false;
```

**Required if searched by phone (partial string match):**
```sql
CREATE INDEX idx_<table>_phone_trgm ON "<Table>"
  USING GIN ("phone" gin_trgm_ops)
  WHERE "isDeleted" = false AND "phone" IS NOT NULL;
```

**Flag as unnecessary (waste space, don't help):**
- GIN indexes on JSONB columns that are never in a WHERE clause (`answers`, `options`)
- Single-column indexes on boolean fields alone
- Indexes that are strict subsets of an existing composite index

#### 2c. CHECK constraint audit

Prisma `enum` generates a PostgreSQL CHECK constraint automatically. For any column using raw `String` where an enum should be used, flag it.

Additionally check migration SQL files for expected CHECK constraints:
- `end_at > start_at` on assessments
- `amount >= 0` on payments
- `fee_amount >= 0` on students
- `negative_marking_value >= 0` on assessments

#### 2d. Relation audit

For every `@relation`:
- Foreign keys should point to the correct table
- Cascades: Teachly uses soft delete — no `onDelete: Cascade` needed (and it would be dangerous)
- Check that no relation allows a record to be fetched without `instituteId` scoping

### Step 3 — Query pattern analysis

For the 3–5 most common queries on each table (inferred from the service files), verify there is an index that covers them:

Read relevant service files:
```
backend/src/<module>/<module>.service.ts
```

For each `prisma.findMany` / `findFirst` / `count`:
1. What columns appear in `where`?
2. What column is `orderBy` using?
3. Does an index cover `(instituteId, <where columns>, <orderBy column>)`?

Flag any query where the WHERE clause columns are not covered by an index.

### Step 4 — Migration file audit

Read all migration SQL files:
```
backend/prisma/migrations/*/migration.sql
```

Check for:
- Partial indexes added manually (Prisma doesn't generate these)
- `CREATE INDEX CONCURRENTLY` on tables with existing rows (required in production)
- Backfill statements for new NOT NULL columns
- Any `DROP COLUMN` that happened in the same migration as a code change (should be separated)

---

## Severity Classification

| Severity | Meaning |
|---|---|
| 🔴 Critical | Will cause incorrect data, cross-tenant data leak, or production outage |
| 🟠 High | Will cause slow queries or missing constraint enforcement at scale |
| 🟡 Medium | Best-practice violation — no immediate risk but accumulates as technical debt |
| 🟢 Info | Minor suggestion or documentation note |

---

## Checklist

- [ ] All models have UUID PK
- [ ] All non-lookup tables have `instituteId`
- [ ] All mutable tables have soft delete fields
- [ ] All `String` columns have `@db.VarChar(N)` where length is known
- [ ] No status/type column is raw `String` (must be `enum`)
- [ ] Every tenant table has `@@index([instituteId, isDeleted])`
- [ ] Search columns have GIN/trigram index in migration SQL
- [ ] No GIN index on JSONB columns that aren't searched
- [ ] No `onDelete: Cascade` on any relation (soft delete model)
- [ ] CHECK constraints present for numeric ranges and status transitions
- [ ] Migration SQL files contain partial indexes not generated by Prisma
- [ ] `CREATE INDEX CONCURRENTLY` used in production-targeted migrations

---

## Output Format

```
## Schema Review — <date or PR title>

### 🔴 Critical Issues
- [Model.field] — [description of violation and risk]
  Fix: [exact Prisma or SQL change]

### 🟠 High — Missing Indexes
- [Model] — query pattern `WHERE instituteId AND <field>` has no covering index
  Fix: [SQL index to add to migration file]

### 🟡 Medium — Best-Practice Violations
- [Model.field] — String column with no @db.VarChar(N) limit
  Fix: add @db.VarChar(255) or appropriate limit

### 🟢 Info
- [note]

### Summary
[2–3 sentences: overall schema health and top priority action]
```
