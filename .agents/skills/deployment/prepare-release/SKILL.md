# Skill: prepare-release

## Purpose

Run the full pre-deployment checklist for Teachly and produce a release summary. Catches schema drift, type errors, missing env vars, hardcoded values, and other issues that would cause a production deployment to fail or behave incorrectly.

## When to Use

- Before merging a feature branch into `main`/`master`
- Before tagging a release version
- After a large refactor that touches multiple modules
- When handing off a build to the client or staging environment

---

## Workflow

### Step 1 — Verify environment configuration

Read the env example file:
```
backend/.env.example   (or root .env.example)
```

Check that every variable listed is:
- Documented with a comment explaining what it does
- Present in the deployment environment (flag any that are missing from the example)
- Not committed with a real value in any file tracked by git

Run:
```bash
git grep -r "sk-" --include="*.ts" --include="*.env"
git grep -r "password123" --include="*.ts"
git grep -r "localhost" --include="*.ts" backend/src/
```

Flag any hardcoded secrets, credentials, or environment-specific URLs.

### Step 2 — Type check the backend

```bash
cd backend && npx tsc --noEmit
```

Zero TypeScript errors required. Fix any before proceeding.

### Step 3 — Prisma schema and migration check

```bash
cd backend && npx prisma validate
```

Then verify all migrations have been applied:
```bash
cd backend && npx prisma migrate status
```

Expected output: `All migrations have been applied.`

If any migration is pending — generate it or apply it before release.

Check the latest migration SQL file manually:
```
backend/prisma/migrations/<latest>/migration.sql
```

Verify:
- [ ] No `DROP COLUMN` that hasn't been through the deprecation cycle
- [ ] New NOT NULL columns have defaults
- [ ] Partial indexes are present (Prisma doesn't auto-generate these)
- [ ] `CREATE INDEX CONCURRENTLY` used for indexes on tables with existing data

### Step 4 — Scan for development-only patterns

Search for patterns that must not reach production:

```bash
# console.log in backend TypeScript source
grep -r "console\.log" backend/src/ --include="*.ts"

# TODO / FIXME / HACK comments
grep -rn "TODO\|FIXME\|HACK\|XXX" backend/src/ --include="*.ts"
grep -rn "TODO\|FIXME\|HACK\|XXX" frontend/src/ --include="*.ts" --include="*.tsx"

# Hardcoded localhost URLs in frontend
grep -r "localhost" frontend/src/ --include="*.ts" --include="*.tsx"

# Direct DB access from frontend
grep -r "supabase\|prisma" frontend/src/ --include="*.ts" --include="*.tsx"

# Hard-coded institute IDs
grep -r "instituteId.*=.*['\"]" backend/src/ --include="*.ts"
```

All `console.log` must be replaced with NestJS `Logger`. Flag every hit.

### Step 5 — Security sweep

```bash
# Check for npm vulnerabilities
cd backend && npm audit --audit-level=high
cd frontend && npm audit --audit-level=high
```

High or critical severity vulnerabilities must be resolved before release.

Also check:
- [ ] CORS origin is set to `FRONTEND_URL` env var — not `*` or hardcoded domain
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are different values (grep both env files)
- [ ] `httpOnly: true` on refresh token cookie
- [ ] `secure: true` on refresh token cookie (production only — OK to skip in dev)
- [ ] MinIO bucket is private (no public-read ACL)

### Step 6 — API endpoint audit

For each module, verify every controller route has the correct guards:

Read all controller files:
```
backend/src/**/*.controller.ts
```

Check each route:
- [ ] Protected routes have `@Roles(...)` decorator
- [ ] Feature-gated routes have `@RequiresFeature(...)` decorator
- [ ] Public routes are explicitly marked `@Public()` — none are accidentally public
- [ ] No route parameter accepts `instituteId` from the client

### Step 7 — Feature flag completeness

Read the feature flag configuration:
```
backend/src/features/ or wherever FeatureGuard is defined
```

Verify:
- [ ] Every new feature-gated route maps to a valid `Feature` enum value
- [ ] The `Feature` enum in code matches the database `features` table values
- [ ] No feature is hardcoded as always-on or always-off

### Step 8 — Frontend build check

```bash
cd frontend && npm run build
```

Zero build errors required. Warnings must be reviewed — `any` types and missing keys in lists should be fixed.

Check the build output:
- [ ] No page is unexpectedly large (> 500KB initial JS)
- [ ] No `localStorage` or `sessionStorage` usage for auth tokens
- [ ] All API base URLs use environment variables

### Step 9 — Compile the release notes

List all changes since the last release tag:

```bash
git log <last-tag>..HEAD --oneline
```

Group by category: Features / Bug Fixes / DB Changes / Security / Config Changes.

---

## Checklist

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npx prisma validate` — schema valid
- [ ] `npx prisma migrate status` — all migrations applied
- [ ] No `console.log` in `backend/src/`
- [ ] No hardcoded `localhost` in `frontend/src/`
- [ ] No direct DB/Supabase calls from frontend
- [ ] `npm audit` — no high/critical vulnerabilities
- [ ] CORS configured to `FRONTEND_URL`, not `*`
- [ ] JWT secrets are different values
- [ ] Refresh token cookie is `httpOnly`
- [ ] Every protected route has `@Roles(...)` and `@RequiresFeature(...)` where required
- [ ] No route accidentally exposes `instituteId` as a client-supplied parameter
- [ ] Frontend build succeeds with zero errors
- [ ] `.env` files not committed to git
- [ ] Release notes drafted

---

## Output Format

```
## Release Checklist — v<version> (<date>)

### ✅ Passed
- TypeScript: zero errors
- Prisma schema: valid
- Migrations: all applied
- ...

### ⚠️ Warnings (review before release)
- [file:line] console.log found — replace with Logger
- [file:line] TODO comment — assess whether blocking

### 🔴 Blockers (must fix before release)
- npm audit: 1 high severity in <package> — upgrade to <version>
- [file:line] hardcoded API key found
- Migration pending: <name> — apply before deploying

### Release Notes Draft
**Features:**
- ...

**Bug Fixes:**
- ...

**DB Changes:**
- ...

### Deployment Steps
1. Apply pending migrations: `npx prisma migrate deploy`
2. Restart backend service
3. Deploy frontend build
4. Smoke test: login, feature X, feature Y
```
