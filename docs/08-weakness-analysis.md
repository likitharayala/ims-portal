# Teachly — Architecture Weakness Analysis (Section 8)

**Reviewer perspective:** Senior architect at a high-scale SaaS company.
**Rating scale:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Summary Verdict

The foundation is solid. Multi-tenancy isolation, soft delete discipline, JWT design, and guard pipeline are done correctly. But there are **5 critical flaws** that will cause production failures before Phase 2 is reached, **8 high-severity design mistakes** that will generate real engineering debt, and several decisions that are architecturally dishonest (documented as "security controls" when they are not).

---

## 1. Critical Flaws

### 🔴 C1 — DB Hit on Every Single Authenticated Request

**What the design says:**
`JwtAuthGuard` performs `SELECT session_id FROM users WHERE id = payload.sub` on every protected request to validate the session.

**Why this is a critical problem:**
This is a synchronous DB query before any business logic runs. At even modest scale:

```
100 institutes × 50 concurrent students × 1 req/2s = 2,500 DB queries/min
just for session validation — before any actual work happens.
```

Add admin requests, assessment auto-saves (every 60s per active student), and notification badge polling and this becomes the #1 DB bottleneck, not business queries.

**Phase 2 claims to fix this with Redis (16-min TTL cache).** But Phase 1 launches without Redis. This means the system will hit DB saturation on session checks alone before it even gets real business load. The Phase 1 threshold of "< 100 institutes" is overly optimistic if any of those institutes run assessments.

**Fix required before Phase 1 launch:** Either accept the Phase 1 limitation explicitly with a hard cap on concurrent users, or bring Redis forward to Phase 1 for session validation only. Do not document this as "fixed in Phase 2" without acknowledging the Phase 1 ceiling.

---

### 🔴 C2 — bcrypt Rounds=12 on Bulk Upload Blocks the Thread

**What the design says:**
Bulk student upload processes each row sequentially, including `bcrypt.hash(tempPassword, 12)` per student.

**The math:**
bcrypt at rounds=12 takes ~300–400ms per hash on modern hardware. Node.js `bcrypt.hash` blocks the event loop via worker thread, but still serializes if called in a loop.

```
500 students × 350ms = 175 seconds (nearly 3 minutes) of blocking work
1000 students × 350ms = 350 seconds (nearly 6 minutes)
```

This will time out at the HTTP layer (NGINX default: 60s). The upload will appear to fail while the server continues processing, potentially creating partial student sets with no feedback to the admin.

**The design acknowledges BullMQ for Phase 2 but does not flag this as a Phase 1 blocker.** It is a Phase 1 blocker. A class of 200 students already breaks this.

**Fix:** Move bulk upload to a background job immediately, even without full BullMQ. Return a job ID, poll for status. Alternatively, use a parallel bcrypt pool with a concurrency limit.

---

### 🔴 C3 — Gmail SMTP Cannot Scale to Multi-Tenant SaaS

**What the design says:**
All transactional emails (admin verification, password reset) are sent via Nodemailer + Gmail SMTP using `SMTP_USER` / `SMTP_PASS` environment variables.

**Gmail SMTP limits:**
- Personal Gmail: 500 emails/day
- Google Workspace: 2,000 emails/day

**The problem:**
All emails for all institutes share a single SMTP account. At 1,000 institutes:
- 1,000 admins sign up → 1,000 verification emails needed on launch day
- 200 institutes reset passwords on the same day → 200 emails
- Gmail rate-limits or suspends the account → **zero auth emails for all institutes**

This isn't a scalability concern — it's a single point of failure that will trigger during beta. One surge of signups breaks the service for everyone.

**Fix:** Replace Gmail SMTP with a transactional email service from day one: AWS SES ($0.10/1000 emails), Resend, SendGrid, or Postmark. These have proper bounce handling, DKIM/SPF, deliverability tracking, and API rate limits orders of magnitude higher.

---

### 🔴 C4 — Assessment Cron is O(all institutes × all active assessments) Every 60 Seconds

**What the design says:**
`AssessmentStatusCronService` runs every 60 seconds and:
1. Queries all PUBLISHED assessments across all institutes where `start_at <= now()`
2. Queries all ACTIVE assessments across all institutes where `end_at <= now()`
3. For each closing assessment: auto-submits all open submissions, runs MCQ auto-evaluation

**The problem:**
At 1,000 institutes with an average of 2 active assessments each, this is 2,000 assessments scanned every minute, plus potentially thousands of submission auto-submits in a single cron tick. If 20 assessments close simultaneously (common — admins often schedule for the same time), the cron processes tens of thousands of submission updates synchronously.

The cron runs on the same NestJS instance handling student HTTP requests. During a peak close event, the event loop is saturated, and student requests time out — **exactly when students are submitting their answers in the final minutes before the deadline**.

**Fix:** Remove the polling cron entirely. Use BullMQ `DelayedJob` — when an admin publishes an assessment, schedule two jobs: one at `start_at` and one at `end_at`. Each job handles only one assessment. No polling, no O(N) scan, no event loop contention. This design must move to Phase 1, not Phase 2.

---

### 🔴 C5 — Notification Fan-Out is Synchronous and Unbounded

**What the design says:**
When admin sends a notification to "all" students, the service inserts one `notification_recipients` row per student synchronously in the request handler.

**The problem:**
```
5,000 students × 1 INSERT each = 5,000 sequential DB writes in a single HTTP request
```

This blocks the request for several seconds, ties up a DB connection pool slot, and will time out with large student bodies. Worse: there's no atomic guarantee — if the server crashes after 3,000 inserts, some students get the notification and some don't, with no way to detect or retry.

**Fix:** Move fan-out to a BullMQ job. HTTP handler inserts the notification record and enqueues one job. The job does the fan-out in batches of 100 with retry semantics.

---

## 2. High-Severity Design Mistakes

### 🟠 H1 — Two Sources of Truth for Refresh Tokens

**What the design says:**
The `users` table has `refresh_token_hash`. There is also a separate `sessions` table with `refresh_token_hash`. The `JwtAuthGuard` queries `users.session_id`, not `sessions`.

**The problem:**
It's unclear which table is the canonical source. The auth docs (Section 3) say refresh token hash is stored in `users.refresh_token_hash` and rotated there. The `sessions` table appears to be an audit trail, but it's never queried for enforcement. If both are updated on refresh, they must be kept in sync. If only `users` is updated, the `sessions` table has stale data. This is a data consistency hazard that will cause bugs when debugging auth issues.

**Fix:** Make the role of `sessions` explicit. Either:
- Use it as the enforcement table (remove `refresh_token_hash` from `users`), or
- Document it as audit-only and never use it for enforcement

---

### 🟠 H2 — InstituteContextMiddleware Trusts Unverified JWT Payload

**What the design says:**
Stage 2 (middleware) extracts `institute_id` from the JWT and binds it to `req.instituteId` **without verifying the JWT signature**. Signature verification happens in Stage 3 (JwtAuthGuard).

**The problem:**
Between Stage 2 and Stage 3, the request has `req.instituteId` set from potentially forged data. Any route that is mistakenly missing `JwtAuthGuard` (developer error, misconfiguration) will process an unverified `institute_id`. This is a latent cross-tenant data leak vector.

In practice, NestJS route guards should be applied globally and opted-out with `@Public()`. The docs describe this but do not document what happens if a developer accidentally skips the guard.

**Fix:** Add an integration test that scans all registered routes and asserts that every non-`@Public()` route has the full guard chain applied. This is a safety net that costs nothing but prevents the entire category of "developer forgot the guard" bugs.

---

### 🟠 H3 — Global Email Uniqueness Creates Unresolvable Business Conflicts

**What the design says:**
`users.email` is globally unique across all institutes. Students cannot change their email. Email cannot be hard-deleted.

**The real-world scenario:**
A student leaves Institute A and joins Institute B. The admin at Institute B tries to add them. The email is already taken — in a soft-deleted record from Institute A. Admin at Institute B gets "Email already in use" with no explanation or resolution path.

In the Indian tuition centre market (the explicit target), students regularly move between institutes. This is not an edge case — it's a core business workflow.

**Fix options (pick one):**
1. Allow email reuse on soft-deleted records (check `is_deleted = true` before rejecting)
2. Make email unique per-institute (not globally) — use phone as the global login identifier
3. Add an admin-initiated "transfer student" workflow

Not deciding this in V1 and saying "email cannot be changed" is deferring a business-breaking problem.

---

### 🟠 H4 — `answers` JSONB Is Written by Both Students and Evaluators

**What the design says:**
The `submissions.answers` JSONB stores student-selected answers during the exam AND evaluator-assigned `marks_awarded` and `feedback` per question post-exam.

**The problem:**
Both the student (via `autoSaveAnswers`) and the evaluator (via `evaluateSubmission`) write to the same `answers` JSONB field. This creates a write conflict window:

```
Student auto-saves at 14:59:58
Assessment closes at 15:00:00
Auto-submit fires, MCQ auto-evaluate runs at 15:00:01
Evaluator opens submission at 15:00:03 and saves marks
```

If MCQ auto-evaluate is updating `answers[].is_correct` and `answers[].marks_awarded` while the evaluator is reading the same field, you have a read-modify-write race. PostgreSQL row-level locking helps, but the JSONB merge logic must be carefully implemented. Nothing in the design documents the locking strategy.

**Fix:** Split the column. Student answers go in `answers` (written only before close). Evaluation results go in `evaluation_results` (written only after close). Never have two roles writing to the same column.

---

### 🟠 H5 — `subjects TEXT[]` on Assessments Is a Maintenance Trap

**What the design says:**
Subjects are stored as `TEXT[]` (PostgreSQL array) on the assessments table. The docs note this was chosen to "avoid a join table."

**The problems:**
- No referential integrity — the admin can type "Maths", "Math", "mathematics" and get three different subject values
- Dropdown population for filters requires `SELECT DISTINCT unnest(subjects) FROM assessments WHERE institute_id = $1` — a slow, non-indexable query
- GIN indexing on `TEXT[]` is possible but adds complexity for negligible benefit
- Renaming a subject means updating every assessment row that contains it

**Fix:** Create an `institute_subjects` table (id, institute_id, name). Assessments reference subject IDs. Costs one join, gains consistency, dropdown population becomes a simple indexed lookup.

---

### 🟠 H6 — The One-Time Credential CSV Is Not Actually Secret

**What the design says:**
After bulk upload, admin receives a base64-encoded CSV of email + temp passwords in the API response body. "Not stored on server."

**The problems:**
1. HTTP request/response bodies appear in: NGINX access logs, NestJS application logs, Supabase query logs, browser network tab history, and any reverse proxy logs
2. "Not stored on server" is technically true but practically false — the data appears in multiple log systems
3. The response body with 1,000 students' plaintext passwords is ~100KB. This is transmitted as a JSON response body, parsed by the browser, potentially cached

**Fix:**
- Generate the CSV as a short-lived server-side file with a one-time download token
- Token expires in 5 minutes, single-use, deleted after download
- Log only "bulk upload CSV downloaded" — not the CSV contents
- Alternatively: show temp passwords in-browser only (never leave the server) and require the admin to manually copy them — already the pattern for single-student creation

---

### 🟠 H7 — No CHECK Constraints on Status Columns

**What the design says:**
Assessment `status` is `VARCHAR(20) DEFAULT 'draft'`. Payment `status` is `VARCHAR(20) DEFAULT 'pending'`. Submission `status` is `VARCHAR(20) DEFAULT 'pending'`.

**The problem:**
There are no database-level `CHECK` constraints on these values. If a bug writes `status = 'complted'` (typo) or `status = 'CLOSED'` (wrong case), the DB accepts it silently. The application would then fail to match `WHERE status = 'closed'` and the assessment would be stuck in limbo.

**Fix:** Add CHECK constraints at creation:
```sql
status VARCHAR(20) NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published', 'active', 'closed', 'evaluated'))
```
This costs nothing and prevents an entire class of data corruption bugs.

---

### 🟠 H8 — Audit Logs Will Bloat Unmanageably

**What the design says:**
`audit_logs` stores `old_values JSONB` and `new_values JSONB` for every mutation. Append-only, never deleted.

**The math:**
- A submission with 50 questions has a large `answers` JSONB
- An `UPDATE` on a submission stores both `old_values` and `new_values` — effectively doubling the submission data
- An assessment evaluation with 200 students generates 200 audit rows, each containing full submission JSONB
- At 1,000 institutes × 10 assessments × 200 students = 2,000,000 audit rows with large JSONB payloads

No archiving strategy, no partitioning by time (though Section 6 mentions it), no index on `created_at` globally (only per `institute_id`).

**Fix:**
- Add a `CHECK (pg_column_size(old_values) < 65536)` guard or truncate/hash large payloads
- Use time-based table partitioning on `created_at` from day one (partition monthly)
- Store large payloads (submissions) as a reference: `{ "ref": "submissions:uuid" }` rather than inline
- Define a retention policy: "audit logs older than 2 years are archived to cold storage"

---

## 3. Architectural Mistakes

### 🟡 A1 — Pre-Signed URL Expiry Conflict with PDF Reading Session

**What the design says:**
MinIO pre-signed URLs expire in 15 minutes. The PDF viewer is PDF.js, which streams the PDF from the URL.

**The problem:**
A student opens a 200-page PDF to study. At minute 16, they scroll to page 50. PDF.js issues a range request to fetch the next chunk of pages — the URL has expired. The PDF freezes or errors. The student must navigate away and back to get a new URL, losing their position.

There is no documented mechanism for the frontend to detect URL expiry and silently refresh it.

**Fix:** Either:
- Extend pre-signed URL expiry to 2 hours (materials are already access-controlled)
- Have the viewer poll `/materials/:id/view-url` every 10 minutes and swap the URL transparently
- Use a streaming proxy: frontend requests `GET /student/materials/:id/stream` → backend proxies from MinIO → student never sees a raw MinIO URL

---

### 🟡 A2 — Access Token in Zustand Means Every Page Refresh Requires Token Refresh

**What the design says:**
Access token stored in Zustand (JS memory). On page refresh, Zustand state is lost. Refresh token is in `httpOnly` cookie.

**The implicit consequence (not documented):**
Every page refresh triggers:
1. Page load → no access token in memory
2. App calls `POST /auth/refresh` using cookie → gets new access token
3. App retries original request

This doubles the initial request count on every navigation. More critically: if the refresh endpoint is slow or the server is under load, the app appears broken on every page load. This also means no deep-linking works without the app first completing the refresh dance.

**This is not a bug — it's a deliberate security trade-off.** But it's undocumented, and any frontend developer joining the team will spend hours debugging why API calls fail on page load.

**Fix:** Document this explicitly as a known pattern. Ensure the frontend handles the refresh-on-load case gracefully with a loading state, not an error flash.

---

### 🟡 A3 — No API Versioning

**What the design says:**
Routes are `/admin/students`, `/student/assessments`, etc. No version prefix.

**The problem:**
When the Next.js frontend needs a different response shape (a new field, a renamed field, a removed field), you must either:
- Break all existing clients
- Deploy frontend and backend simultaneously (only works with zero-downtime deploys)
- Add version-specific workarounds inside the existing handler

For a SaaS with many institutes, even a 30-second deploy window where the frontend is v2 and the backend is still v1 causes errors for active users.

**Fix:** Prefix all routes with `/api/v1/` from the start. Version changes cost nothing to add and prevent a class of deployment problems.

---

### 🟡 A4 — OpenAI Free Tier Is a Shared Rate Limit Across All Institutes

**What the design says:**
AI generation uses OpenAI free tier. Phase 3 plans migration to Ollama/LLaMA.

**The problem:**
OpenAI free tier rate limits are per-API-key, not per-institute. One institute doing heavy AI question generation blocks all other institutes from using the feature simultaneously. There is no per-institute quota, no queue priority, no fair-use enforcement.

**Fix:** Either implement a per-institute token bucket for AI requests (tracked in Redis) or move to a paid OpenAI tier with proper rate limit headroom before launching the AI feature to multiple institutes.

---

### 🟡 A5 — MinIO File Orphan Accumulation

**What the design says:**
When a material is soft-deleted, the MinIO file is retained "for data recovery." Profile photos, replaced PDFs — the old MinIO objects remain.

**The problem:**
Over time:
- Every time a PDF is replaced: old file stays in MinIO
- Every time a material is soft-deleted: file stays in MinIO
- Every time a profile photo is replaced: old photo stays in MinIO
- Soft-deleted students' profile photos stay forever

There is no cleanup job, no orphan detection, no storage cost accounting per institute.

**Fix:** Add a scheduled job that:
- Scans for MinIO objects with no matching active DB record
- Soft-deletes are moved to a `/{institute_id}/trash/` prefix, cleaned up after 30 days

---

### 🟡 A6 — GIN Full-Text Search With `english` Language Config for Indian Names

**What the design says:**
```sql
to_tsvector('english', name || ' ' || email || ' ' || phone)
```

**The problem:**
English language configuration applies stemming (e.g., "running" → "run"). For proper nouns (Indian names like "Rajesh", "Priyanka", "Krishnamurthy"), stemming produces incorrect or no results. Searching "Rajesh" may not match "Rajesh" if the stemmer corrupts the token.

Phone number search via GIN full-text is the wrong tool entirely — phone numbers have no linguistic structure. A partial phone search like "9876" won't work with `plainto_tsquery`.

**Fix:**
- Use `'simple'` language config for proper noun search (no stemming)
- Phone number search: use a `LIKE` or trigram index (`pg_trgm`) instead of GIN full-text
- Consider `pg_trgm` for the entire student search bar — it handles partial matches natively

---

## 4. Unnecessary Complexity

### 🟡 U1 — JSONB GIN Index on MCQ Options Is Unused Overhead

**What the design says:**
```sql
CREATE INDEX idx_questions_options_gin ON assessment_questions USING GIN (options);
CREATE INDEX idx_submissions_answers ON submissions USING GIN (answers);
```

**The problem:**
When does the application query the `options` JSONB field with a GIN index? Assessment questions are always fetched by `assessment_id` — the B-tree index on `(assessment_id, order_index)` is the relevant index. You never search *inside* options JSON. The GIN index adds write overhead to every question insert/update for zero read benefit.

Same for `submissions.answers` — submissions are fetched by `assessment_id` or `student_id`, never searched inside the answers JSONB.

**Fix:** Drop both GIN indexes. They add maintenance overhead and index bloat. If a future use case genuinely requires JSONB search, add them then.

---

### 🟡 U2 — `is_correct` Inside `options` JSONB Duplicates `correct_option` Column

**What the design says:**
MCQ options JSONB: `[{label: "A", text: "...", is_correct: false}, ...]`
Separate column: `correct_option VARCHAR(5)` (stores "A", "B", "C", or "D")

**The problem:**
Two columns represent the same fact. They can get out of sync. Any update to the correct answer must update both, atomically. This is a classic denormalization mistake with no performance benefit.

**Fix:** Remove `is_correct` from the JSONB. Derive it at query time: `option.label === correct_option`. The `correct_option` column is sufficient.

---

### 🟡 U3 — `sessions` Table Purpose Is Unclear

The `sessions` table exists in the schema alongside session data on `users`. The enforcement mechanism uses `users.session_id`. The `sessions` table has indexes suggesting it's used for active session lookups. But Section 3 (Auth) never queries it for enforcement.

This is dead schema weight or an undocumented parallel system. Either use it or remove it. Unclear architecture is technical debt that confuses future developers.

---

## 5. Security Overstatements

### 🟡 S1 — The "Secure Document Viewer" Controls Are Largely Theater

**What the docs call "security controls":**
- Download button disabled
- Right-click `preventDefault()`
- CSS `@media print { display: none }`
- JavaScript `beforeprint` event

**Reality:**
- DevTools → Network tab → copy URL → download directly (bypasses button entirely)
- Right-click can be re-enabled in browser settings; touch devices have different UX
- CSS print blocking is bypassed by printing from browser's PDF viewer, not the page
- `beforeprint` event is not fired in all print paths
- Screenshot: completely unpreventable

The watermark (student's name overlaid on the document) is the **only meaningful control** — it creates accountability, not prevention. Everything else provides the illusion of security.

**The docs acknowledge this in a footnote.** But documenting 4 "security controls" followed by "screenshot prevention cannot be guaranteed" undersells the limitation. The honest statement is: "Only the watermark provides meaningful accountability. All other controls are UI-level friction that any technical user can bypass."

This matters because clients (institute admins) may purchase the system believing document protection is stronger than it is. That's a business risk.

---

## 6. Missing Architecture Concerns

### 🟡 M1 — No Data Privacy / DPDPA Compliance Strategy

The system stores:
- Student DOB, parent name, parent phone, address
- Payment history
- Assessment answers
- Profile photos

India's **Digital Personal Data Protection Act (DPDPA) 2023** applies. Soft delete does not satisfy "right to erasure" — student data is permanently retained in soft-deleted rows and in audit logs.

There is no: consent management, data retention policy, breach notification procedure, or data export for individuals (right to access).

This is not a Phase 5 concern — a DPDPA enforcement notice can arrive in Phase 1. At minimum, document the compliance posture and its gaps.

---

### 🟡 M2 — No Health Check Endpoints or Circuit Breakers

If Gmail SMTP goes down: admin signup is blocked for all institutes (no verification email → no access).
If OpenAI goes down: the AI generation endpoint fails (handled — error shown).
If MinIO goes down: file upload fails, but more critically, **the student exam continues but file uploads fail silently**.

No health check endpoint (`GET /health`) means load balancers can't detect a degraded instance. No circuit breaker means a slow MinIO response holds a connection thread instead of failing fast.

---

### 🟡 M3 — Payment Cron Grace Period Is Calendar-Naive

**What the design says:**
Daily cron: marks a payment as overdue if the month ended more than 5 days ago.
"January payment → overdue on February 6th if still pending."

**The problem:**
Different months have different lengths. The cron calculates grace period based on "month ended + 5 days." February has 28/29 days. A student who joined on January 30th — does their February payment exist at all? The bulk payment generation runs on the 1st of the month, so yes. But the grace period calculation must be `date_trunc('month', now()) > month + interval '1 month' + interval '5 days'`, not a simple subtraction. Off-by-one calendar bugs in billing are a source of real customer complaints.

---

## 7. Simplification Opportunities

### 🟢 Sim1 — The `slug` Field on Institutes Is Unused
The `institutes.slug` field (`sunrise-academy`) exists with a UNIQUE index but there is no documented use. No route uses it. It's dead schema. Remove it or document its planned use.

### 🟢 Sim2 — `is_active` on Both `institutes` and `users` Creates Dual Flag Confusion
`institutes.is_active` and `users.is_active` both exist. If an institute is deactivated (`institutes.is_active = false`), do all associated user logins fail? The guard pipeline queries `users.is_active` but doesn't join `institutes` to check institute-level active status. An admin whose institute is deactivated could still log in if their `users.is_active = true`. The behavior is not documented.

### 🟢 Sim3 — Fixed Pagination of 20 Will Need an Escape Hatch Sooner Than Expected
Evaluation workflow: an admin evaluating submissions needs to see all 200 submissions for an assessment. With 20-per-page pagination, that's 10 API calls to load all. The export endpoint bypasses pagination — but the evaluation list view does not. The fixed limit will create a real UX problem before Phase 3.

### 🟢 Sim4 — `results_released_at` on Submissions vs `results_released` on Assessments
The assessment-level `results_released` boolean releases results for all students. The submission-level `results_released_at` timestamp records when it was released per student. But the guard for student result visibility is `assessments.results_released = true` — the per-submission timestamp appears to serve no enforcement purpose. Either use it for per-student release or remove it.

---

## Priority Fix List

| Priority | Issue | Fix Complexity |
|---|---|---|
| 🔴 1 | C2 — bcrypt bulk upload blocks HTTP thread | Medium (add job queue or parallel) |
| 🔴 2 | C3 — Gmail SMTP single account for all institutes | Low (swap to AWS SES / Resend) |
| 🔴 3 | C4 — Assessment cron is O(N) scan every 60s | High (redesign with BullMQ delayed jobs) |
| 🔴 4 | C5 — Notification fan-out synchronous and unbounded | Medium (queue the fan-out) |
| 🔴 5 | C1 — Session DB hit on every request | Medium (accept Phase 1 limit or bring Redis forward) |
| 🟠 6 | H3 — Global email uniqueness breaks student-moves-institute | Medium (allow reuse on soft-deleted) |
| 🟠 7 | H4 — answers JSONB written by both students and evaluators | Medium (split into two columns) |
| 🟠 8 | H7 — No CHECK constraints on status fields | Low (one-line DB constraint per table) |
| 🟠 9 | H1 — Dual refresh token storage | Low (decide canonical source, document clearly) |
| 🟠 10 | H6 — Credential CSV appears in logs | Medium (one-time download token instead) |
| 🟡 11 | A3 — No API versioning | Low (add `/api/v1/` prefix now) |
| 🟡 12 | A6 — Wrong language config for GIN search | Low (change to `simple`, add trigram) |
| 🟡 13 | U2 — `is_correct` duplicates `correct_option` | Low (remove from JSONB) |
| 🟡 14 | M1 — No DPDPA compliance posture | High (legal risk — needs legal review) |
| 🟡 15 | A1 — Pre-signed URL expires during PDF reading | Low (extend to 2h or add silent refresh) |

---

## What Is Done Well

To be balanced: the following decisions are correct and should not be changed.

- **Multi-tenant isolation** — Three-layer enforcement (JWT → middleware → repository) is the right pattern. Difficult to accidentally cross tenant boundaries.
- **Single active session enforcement** — Clean, simple, impossible to have ghost sessions.
- **Soft delete discipline** — Consistent across all mutable tables. Correct.
- **`institute_id` never from request body** — Always JWT-derived. Correct.
- **Partial indexes on `is_deleted = false`** — Correct. Keeps indexes lean as rows accumulate.
- **Separate `notification_recipients` table** — Correct approach. Scales to large student bodies and enables per-student read/dismiss tracking.
- **Payment amount snapshot at record creation** — Correct. Changing `fee_amount` doesn't retroactively change past payment amounts.
- **JWT access token in memory, refresh token in httpOnly cookie** — Correct security posture.
- **Audit log as append-only with Supabase RLS** — Correct. The RLS enforcement of insert-only is the right way to make it tamper-proof.
