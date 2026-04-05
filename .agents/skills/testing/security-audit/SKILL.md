# Skill: security-audit

## Purpose

Run a structured security audit of a Teachly module or the full codebase. Combines automated scanning (npm audit, grep for patterns) with manual checklist review of the guard chain, tenant isolation, input validation, and file upload handling.

## When to Use

- Before a production release
- After implementing a new auth flow or file upload feature
- When adding a new endpoint that handles sensitive data
- Periodically as a scheduled security review
- When the `security-reviewer` agent flags issues that need fixing and re-verification

---

## Workflow

### Step 1 — Dependency vulnerability scan

```bash
cd backend  && npm audit --audit-level=high --json > /tmp/backend-audit.json
cd frontend && npm audit --audit-level=high --json > /tmp/frontend-audit.json
```

Review each high/critical finding:
- Is the vulnerable code path actually reachable in Teachly?
- Is a patched version available? (`npm audit fix`)
- If no fix exists, document the risk and mitigating controls

### Step 2 — Hardcoded secret scan

```bash
# API keys, tokens, passwords in source
git grep -rn \
  -e "sk-" \
  -e "password=" \
  -e "secret=" \
  -e "apiKey" \
  -e "MINIO_SECRET" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.env"

# Hardcoded UUIDs that look like real institute or user IDs
git grep -rn "[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}" \
  backend/src/ --include="*.ts"

# localhost URLs that would break in production
git grep -rn "localhost" frontend/src/ --include="*.ts" --include="*.tsx"
```

Any match outside of `.env.example` or test files is a blocker.

### Step 3 — Tenant isolation audit

Read every service file:
```
backend/src/**/*.service.ts
```

For every Prisma query, verify:

```typescript
// REQUIRED on every findMany / findFirst / count / update
{ where: { instituteId: <from JWT>, isDeleted: false } }

// REQUIRED on every create
{ data: { instituteId: <from JWT> } }
```

**Red flags to search for:**
```bash
# findUnique without instituteId — IDOR vulnerability
grep -n "findUnique" backend/src/ -r --include="*.ts"

# instituteId coming from req.body or req.params — must come from req.instituteId only
grep -n "req\.body\.instituteId\|dto\.instituteId\|params\.instituteId" backend/src/ -r --include="*.ts"
```

Every `findUnique` must be replaced with `findFirst` that includes `instituteId` in the where clause.

### Step 4 — Auth and session audit

Read the auth module:
```
backend/src/auth/auth.service.ts
backend/src/auth/auth.controller.ts
backend/src/auth/guards/
backend/src/auth/middleware/
```

Check:
- [ ] Login: `session_id` generated with `randomUUID()` and stored in DB on every login
- [ ] Every JWT is validated against `users.session_id` in DB — not just signature
- [ ] Logout: `session_id` rotated in DB — old tokens immediately invalid
- [ ] Password reset: all sessions invalidated (new `session_id`)
- [ ] Password reset token: single-use, 30-min expiry, hashed in DB
- [ ] Email verification token: single-use, invalidated after use
- [ ] Refresh token: `httpOnly` cookie, `secure` flag, `sameSite=strict`
- [ ] Access token: in Zustand memory only — not `localStorage`
- [ ] bcrypt rounds: `await bcrypt.hash(password, 12)` — never lower than 12
- [ ] No plaintext password appears in any log, error message, or DB column

### Step 5 — Guard chain completeness

Read all controller files:
```bash
grep -rn "@Controller\|@Get\|@Post\|@Patch\|@Delete\|@Public\|@Roles\|@RequiresFeature" \
  backend/src/ --include="*.controller.ts"
```

For each route, verify:

| Condition | Required decorator |
|---|---|
| Route is public (login, signup, health) | `@Public()` |
| Route requires auth + role check | `@Roles(Role.Admin)` or `@Roles(Role.Student)` |
| Route is behind a feature flag | `@RequiresFeature(Feature.X)` |
| Route requires admin AND feature | Both `@Roles` and `@RequiresFeature` |

Flag any route that has neither `@Public()` nor `@Roles(...)`.

### Step 6 — Input validation audit

Read all DTO files:
```
backend/src/**/*.dto.ts
```

For each DTO class, verify:
- [ ] Every field has at least one `class-validator` decorator
- [ ] `@IsString()` fields have `@MaxLength(N)` matching the DB column's `VARCHAR(N)`
- [ ] `@IsNumber()` fields have `@Min()` / `@Max()` where semantically appropriate
- [ ] No field named `instituteId` — it must never be in a DTO
- [ ] Enum fields use `@IsEnum(MyEnum)`, not `@IsString()` with a comment
- [ ] Optional fields have `@IsOptional()` before other validators

Check global ValidationPipe configuration:
```bash
grep -n "ValidationPipe" backend/src/main.ts
```

Must include: `whitelist: true, forbidNonWhitelisted: true`.

### Step 7 — File upload security audit

Read all file upload handlers:
```bash
grep -rn "FileInterceptor\|UploadedFile\|multer\|mimetype\|originalname" \
  backend/src/ --include="*.ts" -l
```

For each upload handler, check:
- [ ] MIME type validated from **magic bytes** (first bytes of file buffer), not `file.mimetype` from the request header alone
- [ ] File extension validated against explicit whitelist (no `.exe`, `.js`, `.html`, `.php`)
- [ ] File size limit enforced server-side
- [ ] Server generates the filename (UUID + extension) — client-supplied filename is discarded
- [ ] MinIO path follows `/{instituteId}/{resource}/{uuid}.{ext}` — no flat paths
- [ ] No path traversal: path is constructed server-side, never string-concatenated with user input

```bash
# Check for use of original filename (dangerous)
grep -rn "originalname\|file\.name" backend/src/ --include="*.ts"
```

### Step 8 — Sensitive data exposure audit

```bash
# Passwords in responses — passwordHash must never be selected
grep -rn "passwordHash\|password_hash" backend/src/ --include="*.ts" | grep -v "spec\|hash.*password\|dto"

# session_id in responses
grep -rn "sessionId" backend/src/ --include="*.ts" | grep -v "spec\|session_id.*=\|compare"

# Stack traces in error responses
grep -rn "err\.stack\|error\.stack\|message.*stack" backend/src/ --include="*.ts"
```

None of these should appear in API response objects.

### Step 9 — CORS and transport security

Read the main application bootstrap:
```
backend/src/main.ts
```

Verify:
- [ ] `app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true })` — not `origin: '*'`
- [ ] `helmet()` enabled for security headers
- [ ] Rate limiter configured globally

### Step 10 — Compile and triage findings

Group all findings by severity and produce the audit report.

---

## Severity Classification

| Level | Criteria |
|---|---|
| 🔴 Critical | Data leak, cross-tenant access, authentication bypass, RCE |
| 🟠 High | Privilege escalation, IDOR, missing auth on protected route, SQL injection |
| 🟡 Medium | Missing rate limit, verbose error messages, weak validation |
| 🟢 Info | Best-practice gap with no direct exploitability |

---

## Checklist

- [ ] `npm audit` — no high/critical unresolved vulnerabilities
- [ ] No hardcoded secrets or real credentials in source files
- [ ] No `findUnique` without `instituteId` in the where clause
- [ ] No `instituteId` in any DTO (must come from JWT only)
- [ ] Every route has `@Public()` or `@Roles(...)` — none unguarded
- [ ] bcrypt rounds = 12
- [ ] Refresh token cookie is `httpOnly` + `secure` + `sameSite=strict`
- [ ] `passwordHash` never returned in API responses
- [ ] File uploads: magic byte MIME check, server-generated filename, scoped MinIO path
- [ ] CORS locked to `FRONTEND_URL`
- [ ] `ValidationPipe` has `whitelist: true` and `forbidNonWhitelisted: true`
- [ ] No stack traces in error responses

---

## Output Format

```
## Security Audit — <module or "full codebase"> (<date>)

### 🔴 Critical
- [file:line] IDOR: `findUnique({ where: { id } })` — no instituteId check
  Fix: replace with `findFirst({ where: { id, instituteId: ctx.instituteId, isDeleted: false } })`

### 🟠 High
- [file:line] Route `POST /admin/notes` has @Roles but missing @RequiresFeature(Feature.NOTES)
  Fix: add @RequiresFeature(Feature.NOTES) decorator

### 🟡 Medium
- [file:line] DTO field `description` has no @MaxLength — DB column is VARCHAR(1000)
  Fix: add @MaxLength(1000) to the DTO field

### 🟢 Info
- [file:line] console.log with non-sensitive data — replace with Logger for consistency

### Dependency Scan
- backend: 0 high, 0 critical
- frontend: 1 moderate (package: X, path: Y, no fix available — mitigated by Z)

### Summary
[2–3 sentences: overall security posture and top priority action item]
```
