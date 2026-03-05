# Teachly — Scalability Architecture (Section 6)

**Design target:** Thousands of institutes, each with hundreds of students, running concurrently on shared infrastructure. Multi-tenant system where one institute's load spike must not degrade another's experience.

---

## Phase Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  PHASE 1 — MVP (Now)                                                      │
│  Single backend instance · Supabase PostgreSQL · No cache                 │
│  Handles: small launch, < 100 institutes, < 5K students total             │
│                                                                           │
│  PHASE 2 — Redis Layer (Growth)                                           │
│  Add Redis · Cache hot data · Background job queue                        │
│  Handles: 100–1,000 institutes, 50K+ students, peak exam loads            │
│                                                                           │
│  PHASE 3 — Horizontal Scale (Scale)                                       │
│  NGINX load balancer · Multiple NestJS instances · CDN                    │
│  Handles: 1,000–10,000 institutes, millions of requests/day               │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — MVP Architecture

### Current Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1 DEPLOYMENT                                                       │
│                                                                           │
│  ┌─────────────┐   HTTPS    ┌──────────────────┐    SQL    ┌──────────┐  │
│  │  Next.js    │ ─────────► │  NestJS (single  │ ────────► │Supabase  │  │
│  │  (Vercel)   │            │  instance, VPS)  │           │PostgreSQL│  │
│  └─────────────┘            └────────┬─────────┘           └──────────┘  │
│                                      │                                    │
│                                      │ MinIO SDK                          │
│                                      ▼                                    │
│                             ┌────────────────┐                            │
│                             │  MinIO / Local │                            │
│                             │  File Storage  │                            │
│                             └────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 1 Scaling Techniques

**1. Database Indexing (primary tool)**

Already in place from Section 2 schema. These indexes handle 95% of performance needs at small scale:

```
Composite (institute_id, is_deleted) on every major table
  → All list queries hit this index — never full table scan

Partial indexes WHERE is_deleted = false
  → Index only contains active rows — stays lean as data grows

GIN full-text indexes (students, materials)
  → Handles search without LIKE '%...%' full scans

Status-specific partial indexes
  → Dashboard count queries instant (payments pending, assessments active)

Time-based descending indexes (created_at DESC)
  → Latest-first list pagination always fast
```

**2. Rate Limiting (built in)**

```
/auth/login     → 5 req / 15 min / IP
/auth/signup    → 3 req / hour / IP
/auth/refresh   → 10 req / 15 min / IP
All routes      → 100 req / min / IP

Implemented in NestJS via @nestjs/throttler
Stored in memory (Phase 1) — moved to Redis in Phase 2
```

**3. Pagination (hard-fixed at 20)**

```
Every list endpoint returns max 20 rows.
Client cannot override the limit.
→ Prevents expensive "get everything" queries
→ Response payload always bounded
→ Database cost per request is predictable
```

**4. Connection Pooling (Supabase built-in)**

```
Supabase provides PgBouncer connection pooler.
NestJS connects to the pooler endpoint (port 6543), not direct Postgres (5432).
Max pool size configured at Supabase dashboard.
→ Prevents "too many connections" errors under load
```

---

### Phase 1 Bottlenecks

These are the points that will break first as load grows:

```
BOTTLENECK 1 — Dashboard Stats Queries (CRITICAL)
  Every admin page load executes 4 separate COUNT queries:
    SELECT COUNT(*) FROM students WHERE institute_id = $1 AND is_deleted = false
    SELECT COUNT(*), SUM(amount) FROM payments WHERE status IN ('pending','overdue')...
    SELECT COUNT(*) FROM assessments WHERE status IN ('published','active')...
    SELECT COUNT(*) FROM notification_recipients WHERE is_read = false...
  100 concurrent admins loading dashboards = 400 COUNT queries simultaneously.
  → FIX IN PHASE 2: Redis cache with 5-minute TTL

BOTTLENECK 2 — Assessment Auto-Submit Spike (CRITICAL AT SCALE)
  When a large assessment closes (e.g. 500 students all auto-submitted at end_at):
  - 500 UPDATE submissions rows
  - 500 MCQ auto-evaluations
  - 500 absent-student record creation checks
  All happening in one cron tick.
  → FIX IN PHASE 2: Background job queue (BullMQ) — fan out submission processing

BOTTLENECK 3 — Feature Flag Query Per Request
  Every protected request queries institute_features:
    SELECT feature_id FROM institute_features WHERE institute_id = $1
  This runs on EVERY API call, millions of times per day.
  → FIX IN PHASE 2: Redis cache feature flags per institute

BOTTLENECK 4 — AI Generation Blocking HTTP Request
  OpenAI API call can take 5–20 seconds.
  During this time the NestJS event loop thread is awaiting a response.
  Under heavy load: request queue builds up.
  → FIX IN PHASE 2: Async job queue for AI generation

BOTTLENECK 5 — Pre-Signed URL Generation at Scale
  Every material view = one MinIO presignedGetObject() call.
  50 students opening the same material simultaneously = 50 SDK calls.
  MinIO SDK is fast but adds latency per request.
  → FIX IN PHASE 2: Short-TTL cache of pre-signed URLs (5-minute cache)

BOTTLENECK 6 — Single NestJS Instance
  Node.js is single-threaded. CPU-bound work (bcrypt, PDF validation) blocks.
  bcrypt.hash(password, 12) takes ~200ms — 50 concurrent bcrypt calls = 10s wait.
  → FIX IN PHASE 3: Multiple NestJS instances behind load balancer
```

---

## Phase 2 — Redis Caching Layer

### Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 DEPLOYMENT                                                         │
│                                                                             │
│  ┌─────────────┐         ┌──────────────────────────────┐                  │
│  │  Next.js    │─HTTPS──►│  NestJS (single instance)    │                  │
│  │  (Vercel)   │         │                              │                  │
│  └─────────────┘         │  ┌────────────────────────┐  │                  │
│                           │  │  Cache Layer (Redis)   │  │                  │
│                           │  │  Check → Hit? Return  │  │                  │
│                           │  │  Miss? Query DB + Set  │  │                  │
│                           │  └───────────┬────────────┘  │                  │
│                           └─────────────┼────────────────┘                  │
│                                         │                                   │
│             ┌───────────────────────────┼────────────────────┐              │
│             │                           │                    │              │
│             ▼                           ▼                    ▼              │
│  ┌──────────────────┐  ┌────────────────────────┐  ┌──────────────────┐   │
│  │  Supabase        │  │  Redis                  │  │  MinIO           │   │
│  │  PostgreSQL      │  │                         │  │  (File Storage)  │   │
│  │  (source of      │  │  • Dashboard stats      │  │                  │   │
│  │   truth)         │  │  • Feature flags        │  │                  │   │
│  └──────────────────┘  │  • Session data         │  └──────────────────┘   │
│                         │  • Pre-signed URL cache │                         │
│                         │  • Rate limit counters  │                         │
│                         │  • Job queue (BullMQ)   │                         │
│                         └────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────┘
```

---

### Caching Candidates

#### Cache 1 — Dashboard Stats (5-minute TTL)

```
KEY:   dashboard:stats:{institute_id}
TTL:   300 seconds (5 minutes)
VALUE: {
  totalStudents: 245,
  pendingPaymentsCount: 18,
  pendingPaymentsAmount: 27400.00,
  upcomingAssessmentsCount: 3,
  unreadNotificationsCount: 142,
  cachedAt: "2025-03-01T10:00:00Z"
}

FLOW:
  1. Admin loads dashboard
  2. Check Redis: GET dashboard:stats:{institute_id}
  3. Cache HIT  → return cached stats immediately (< 1ms)
  4. Cache MISS → run 4 DB COUNT queries, cache result, return

INVALIDATION:
  TTL-based only. Stats are stale by up to 5 minutes — acceptable for dashboard.
  No event-based invalidation (overkill for Phase 2).

PERFORMANCE IMPACT:
  100 admins loading dashboards per minute
  Without cache: 400 COUNT queries/min
  With cache:    4 COUNT queries per 5 min per institute ≈ 80% reduction
```

#### Cache 2 — Institute Feature Flags (15-minute TTL)

```
KEY:   features:{institute_id}
TTL:   900 seconds (15 minutes)
VALUE: ["students", "materials", "assessments"]  ← array of enabled feature keys

FLOW:
  Every protected API request checks this cache before querying DB.
  Cache MISS → query institute_features table → cache result

  FeatureGuard becomes:
    1. Check Redis: GET features:{institute_id}
    2. HIT: check if required feature in cached array
    3. MISS: query DB, cache for 15 min, check

INVALIDATION:
  When admin toggles a feature ON/OFF:
    → DELETE features:{institute_id}  (next request re-populates)
  This is event-based invalidation — feature changes take effect within
  one request (not after TTL expiry).

PERFORMANCE IMPACT:
  Every single API request currently hits the DB for feature check.
  1,000 requests/min × 1 DB query = 1,000 extra DB queries/min.
  With cache: effectively 0 DB queries for feature checks (until invalidated).
```

#### Cache 3 — Session Validation (per-request)

```
KEY:   session:{user_id}
TTL:   16 minutes (slightly longer than access token expiry of 15 min)
VALUE: {
  session_id: "uuid-of-current-session",
  institute_id: "uuid",
  role: "admin" | "student",
  is_deleted: false
}

FLOW:
  JwtAuthGuard currently queries users table on EVERY request to get session_id.
  With cache:
    1. Check Redis: GET session:{user_id}
    2. HIT:  compare JWT.session_id === cached.session_id
    3. MISS: query users table, cache for 16 min

INVALIDATION:
  On LOGIN:   SET session:{user_id} = { new session_id }
  On LOGOUT:  DELETE session:{user_id}
  On DELETE:  DELETE session:{user_id}
  On PASSWORD_CHANGE: SET session:{user_id} = { new session_id }

PERFORMANCE IMPACT:
  Every API request = 1 users table query currently.
  With cache: ~0 users table queries for session check between logins.
  This is the highest-frequency query in the entire system.
```

#### Cache 4 — Pre-Signed URL Cache (5-minute TTL)

```
KEY:   presigned:{institute_id}:{file_path_hash}
TTL:   300 seconds (5 minutes — shorter than 15-min URL expiry)
VALUE: {
  url: "https://minio.host/...?X-Amz-Signature=...",
  expiresAt: "2025-03-01T10:15:00Z"
}

FLOW:
  When 50 students from the same institute open the same PDF simultaneously:
    1. First request: generate presigned URL, cache it
    2. Requests 2–50: return cached URL (same URL, same file, same 15-min window)
    → 50 MinIO SDK calls → 1 MinIO SDK call + 49 Redis reads

  Cache TTL (5 min) < URL expiry (15 min):
    → Cached URLs always have at least 10 minutes remaining when served
    → Never serve an expired URL from cache

WHEN NOT TO USE CACHE:
  Profile photos: per-student, low concurrency — skip cache overhead
  Answer uploads during evaluation: admin-only, one at a time — skip
  Cache only when same file likely requested by multiple clients simultaneously
```

#### Cache 5 — Rate Limiting (move from memory to Redis)

```
Phase 1: @nestjs/throttler stores counters in process memory.
         Problem: multiple NestJS instances in Phase 3 have separate counters
                  → rate limit is per-instance, not per-user globally

Phase 2: Move to ThrottlerStorageRedisService
  KEY:   throttle:{endpoint}:{ip}
  TTL:   matches rate limit window (15 min, 60 min, etc.)
  VALUE: request count

  All NestJS instances share one Redis counter per IP → true global rate limiting
  Works correctly even before Phase 3 horizontal scaling
```

---

### Background Job Queue — BullMQ on Redis

For operations that are slow, spiky, or failure-tolerant.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  BULLMQ JOB QUEUE ARCHITECTURE                                              │
│                                                                             │
│  NestJS API (Producer)              NestJS Worker (Consumer)                │
│  ┌─────────────────────┐           ┌──────────────────────────┐            │
│  │                     │           │                          │            │
│  │  Queue.add(job)     │──Redis──► │  @Process(jobType)       │            │
│  │                     │           │  Processes job           │            │
│  └─────────────────────┘           │  Retries on failure      │            │
│                                    │  Reports completion       │            │
│                                    └──────────────────────────┘            │
│                                                                             │
│  In Phase 2: Worker runs in same NestJS process (separate module)           │
│  In Phase 3: Worker runs in dedicated NestJS worker instances               │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Job 1 — Assessment Auto-Submit & MCQ Evaluation

```
TRIGGER: AssessmentStatusCronService detects end_at <= now()

WITHOUT QUEUE (Phase 1 problem):
  Cron runs inline → 500 submission updates in one tick → event loop blocked

WITH QUEUE (Phase 2):
  Cron adds ONE job per assessment:
    queue.add('assessment.close', { assessmentId, instituteId })

  Worker processes:
    1. Fetch all pending submissions for this assessment (batch 50 at a time)
    2. For each batch:
       a. UPDATE submissions SET status='submitted', submitted_at=end_at
       b. Run MCQ auto-evaluation
       c. Create absent records for non-starters
    3. UPDATE assessments SET status='closed'
    4. Emit assessment.closed event

  RETRY POLICY: 3 retries with exponential backoff (1s, 5s, 25s)
  CONCURRENCY: 5 parallel workers on this queue
  PRIORITY: high (time-sensitive)
```

#### Job 2 — AI Question Generation (Async)

```
TRIGGER: Admin clicks "Generate Questions"

WITHOUT QUEUE (Phase 1 problem):
  HTTP request waits up to 20 seconds for OpenAI → poor UX, ties up connection

WITH QUEUE (Phase 2):
  API immediately returns: { jobId: "uuid", status: "processing" }
  Worker picks up job:
    1. Call AiService.generateQuestions(subject, topic, count, type, difficulty)
    2. On success: store result in Redis (TTL: 10 minutes)
       KEY: ai:result:{jobId}
    3. On failure: mark job as failed, store error in Redis

  Frontend polls: GET /admin/assessments/ai-status/:jobId
    - Status: 'processing' | 'complete' | 'failed'
    - On complete: fetch generated questions from Redis result
    - On failed: show error + allow retry

  RETRY POLICY: 2 retries (OpenAI transient errors common)
  TIMEOUT: 30 seconds per attempt
  FALLBACK: always allow manual entry regardless of job status
```

#### Job 3 — Bulk Student Upload Processing

```
TRIGGER: Admin uploads Excel file with 500+ student rows

WITHOUT QUEUE (Phase 1 problem):
  Processing 500 rows inline → HTTP request times out after 30s

WITH QUEUE (Phase 2):
  API receives file, stores it temporarily, adds job:
    queue.add('students.bulk_upload', { fileKey, instituteId, adminId })
  Returns: { jobId: "uuid", status: "processing" }

  Worker processes in batches of 50:
    1. Parse Excel rows
    2. Validate each row
    3. INSERT batch of users + students + payments in transaction
    4. Accumulate results: { created, skipped, errors[] }

  On completion:
    - Store summary + credentials CSV in Redis (TTL: 30 minutes — admin must download quickly)
    - KEY: bulk_upload:result:{jobId}

  Frontend polls: GET /admin/students/bulk-status/:jobId
```

#### Job 4 — Email Sending

```
TRIGGER: Any event that requires email (verification, password reset)

WITHOUT QUEUE (Phase 1 problem):
  Nodemailer SMTP call inline → if Gmail is slow, auth request is slow

WITH QUEUE (Phase 2):
  API stores email job:
    queue.add('email.send', { to, subject, template, variables }, { priority: 10 })
  Returns immediately — user does not wait for email delivery

  Worker:
    1. Render email template with variables
    2. Call Nodemailer SMTP
    3. On failure: retry up to 3 times

  RETRY POLICY: 3 retries, delays: 5s, 30s, 5min
  PRIORITY: auth emails (verification, reset) are high priority
```

#### Job 5 — Payment Auto-Generation (Monthly Cron)

```
TRIGGER: @Cron on 1st of month

PROBLEM AT SCALE:
  10,000 institutes × 300 students avg = 3,000,000 payment records to create in one run

WITH QUEUE:
  Cron adds one job per institute (not per student):
    for each institute:
      queue.add('payments.generate_monthly', { instituteId, month }, { delay: index * 100 })

  Staggered with 100ms delay between jobs → smooth DB load over ~17 minutes

  Worker per institute:
    1. Fetch all active students for institute (no pagination — batch SELECT)
    2. INSERT payment records (INSERT ... ON CONFLICT DO NOTHING for idempotency)
    3. AuditLog

  CONCURRENCY: 20 parallel workers (20 institutes processed simultaneously)
```

---

## Phase 3 — Horizontal Scaling

### Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3 DEPLOYMENT                                                             │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  CDN (Cloudflare)                                                          │ │
│  │  • Static assets (Next.js JS/CSS bundles)                                 │ │
│  │  • Edge caching of public pages (landing page, docs)                      │ │
│  │  • DDoS protection                                                         │ │
│  │  • Geo-routing (users served from nearest PoP)                            │ │
│  └──────────────────────────────┬────────────────────────────────────────────┘ │
│                                 │                                               │
│  ┌──────────────────────────────▼────────────────────────────────────────────┐ │
│  │  NGINX Load Balancer                                                       │ │
│  │                                                                             │ │
│  │  • SSL termination                                                         │ │
│  │  • Upstream: NestJS API pool                                               │ │
│  │  • Algorithm: least_conn (route to least busy instance)                   │ │
│  │  • Health checks: /health every 10s (remove failed instances)             │ │
│  │  • Sticky sessions: NOT needed (stateless JWT — any instance handles any  │ │
│  │    request because session state is in Redis, not process memory)          │ │
│  └──────┬───────────┬───────────┬───────────────────────────────────────────┘ │
│         │           │           │                                               │
│  ┌──────▼──┐  ┌─────▼───┐  ┌───▼─────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ NestJS  │  │ NestJS  │  │ NestJS  │  │ NestJS   │  │  NestJS Workers    │ │
│  │ API #1  │  │ API #2  │  │ API #3  │  │ Worker   │  │  (BullMQ queue     │ │
│  │         │  │         │  │         │  │  #1      │  │   consumers)       │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬─────┘  └────────────────────┘ │
│       └────────────┴────────────┴────────────┘                                 │
│                              │                                                  │
│              ┌───────────────┼────────────────────┐                            │
│              │               │                    │                            │
│              ▼               ▼                    ▼                            │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐                 │
│  │  Supabase        │  │  Redis       │  │  MinIO           │                 │
│  │  PostgreSQL      │  │  Cluster     │  │  (shared object  │                 │
│  │  (shared — all   │  │  (shared —   │  │   storage)       │                 │
│  │  instances use   │  │  all         │  │                  │                 │
│  │  same DB via     │  │  instances   │  └──────────────────┘                 │
│  │  PgBouncer)      │  │  share       │                                        │
│  └──────────────────┘  │  cache)      │                                        │
│                         └──────────────┘                                        │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Why This Works Without Sticky Sessions

```
Traditional session-based apps need sticky sessions (same user → same server)
because session state is stored in process memory.

Teachly is stateless by design:
  ✓ Session state in Redis (all instances read same Redis)
  ✓ Rate limit counters in Redis (all instances share same counters)
  ✓ Feature flags cached in Redis (all instances share same flags)
  ✓ Job queue in Redis (any instance can produce, any worker can consume)
  ✓ JWT carries user identity (no server-side session lookup except Redis/DB)

Result: NGINX can route any request to any instance.
        Any instance can handle any user from any institute.
        No session affinity needed → true horizontal scaling.
```

---

### Database Scaling Strategy

#### Read Replicas

```
Phase 3: Add read replicas to Supabase PostgreSQL

Write operations (INSERT, UPDATE, DELETE) → Primary
Read operations (SELECT)                  → Read replica(s)

Routes to replica:
  ✓ Dashboard stats queries
  ✓ List endpoints (students, materials, assessments, payments)
  ✓ Assessment question fetch during exam
  ✓ Student results view

Routes to primary:
  ✓ Student creation / update / delete
  ✓ Submission save / auto-save
  ✓ Payment status update
  ✓ Audit log writes

NestJS TypeORM / Drizzle replication config:
  primary:  DATABASE_URL (connection string to primary)
  replicas: DATABASE_READ_URL (connection string to replica)
```

#### Partitioning Strategy (Future — Phase 4+)

```
When a single table exceeds 10M rows, consider table partitioning:

audit_logs → partition by RANGE on created_at (monthly partitions)
  → Old partitions can be archived to cold storage
  → Queries on recent data never touch old partitions

submissions → partition by RANGE on created_at (monthly partitions)
  → Assessment submissions are time-bounded — old exams rarely queried

payments → partition by RANGE on month (quarterly partitions)
  → Payment queries always filter by month — partition pruning is effective
```

---

### CDN Usage

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CDN LAYER — CLOUDFLARE (or equivalent)                                     │
│                                                                             │
│  WHAT CDN HANDLES:                                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STATIC ASSETS (always CDN-cached, long TTL)                         │   │
│  │                                                                      │   │
│  │  Next.js JS/CSS bundles  → TTL: 1 year (content-hashed filenames)   │   │
│  │  Public images/icons     → TTL: 30 days                             │   │
│  │  Web fonts               → TTL: 1 year                              │   │
│  │  Excel template download → TTL: 24 hours                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DYNAMIC API REQUESTS (NOT cached by CDN)                            │   │
│  │                                                                      │   │
│  │  All /api/* routes → Cache-Control: no-store                        │   │
│  │  CDN passes through to NGINX → NestJS                               │   │
│  │  API responses are private (institute-specific, user-specific)       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MinIO FILE DELIVERY                                                  │   │
│  │                                                                      │   │
│  │  Phase 2: Files delivered directly from MinIO via pre-signed URLs    │   │
│  │                                                                      │   │
│  │  Phase 3 option: MinIO behind CDN                                    │   │
│  │    Pros: PDF delivery faster globally (PoP near student)             │   │
│  │    Cons: Pre-signed URL caching requires careful configuration       │   │
│  │          (CDN must respect S3 signed URL expiry headers)             │   │
│  │                                                                      │   │
│  │  Decision: Keep MinIO delivery direct in Phase 3.                    │   │
│  │  PDF.js fetches file once and caches in browser for session.         │   │
│  │  CDN for MinIO is Phase 4+ if latency becomes an issue.              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  DDoS PROTECTION:                                                           │
│  Cloudflare absorbs volumetric attacks before they reach the origin.        │
│  Rate limiting at CDN edge for /auth/login complements NestJS rate limits.  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Bottleneck Analysis — Full Map

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  BOTTLENECK MAP — ALL PHASES                                                    │
│                                                                                 │
│  #  │  Bottleneck                   │  Phase 1    │  Phase 2    │  Phase 3     │
│  ───┼───────────────────────────────┼─────────────┼─────────────┼────────────  │
│  1  │  Dashboard COUNT queries      │  Direct DB  │  Redis 5m   │  Redis 5m    │
│  2  │  Feature flag per-request DB  │  Direct DB  │  Redis 15m  │  Redis 15m   │
│  3  │  Session lookup per-request   │  Direct DB  │  Redis 16m  │  Redis 16m   │
│  4  │  Assessment close spike       │  Inline     │  BullMQ     │  BullMQ      │
│  5  │  AI generation (20s wait)     │  Blocking   │  Async job  │  Async job   │
│  6  │  Bulk upload timeout          │  Blocking   │  Async job  │  Async job   │
│  7  │  Email SMTP latency           │  Blocking   │  Job queue  │  Job queue   │
│  8  │  bcrypt CPU blocking          │  Inline     │  Inline     │  Multi-inst  │
│  9  │  Single NestJS process        │  Present    │  Present    │  Fixed (LB)  │
│  10 │  Pre-signed URL generation    │  Per-req    │  5m cache   │  5m cache    │
│  11 │  Monthly payment cron spike   │  Inline     │  Staggered  │  Staggered   │
│  12 │  DB connections (too many)    │  PgBouncer  │  PgBouncer  │  PgBouncer+  │
│  13 │  Rate limit (per-instance)    │  Memory     │  Redis      │  Redis       │
│  14 │  Static asset delivery        │  Origin     │  Origin     │  CDN         │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Database Indexing Strategy

### Index Patterns by Query Type

#### Pattern A — Tenant Isolation (every table)

```sql
-- Applied to: students, study_materials, assessments, submissions,
--             payments, notifications, notification_recipients, audit_logs

CREATE INDEX idx_{table}_institute
  ON {table}(institute_id, is_deleted);

-- Used by: every list endpoint, every lookup
-- Selectivity: very high (filters to one institute's active records)
```

#### Pattern B — Dashboard Counter Queries

```sql
-- Students total
CREATE INDEX idx_students_active
  ON students(institute_id)
  WHERE is_deleted = false;

-- Pending payments + amount (covers both COUNT and SUM)
CREATE INDEX idx_payments_dashboard
  ON payments(institute_id, status, amount)
  WHERE is_deleted = false AND status IN ('pending', 'overdue');

-- Upcoming assessments (published or active)
CREATE INDEX idx_assessments_upcoming
  ON assessments(institute_id, status, start_at)
  WHERE is_deleted = false AND status IN ('published', 'active');

-- Unread notifications (cross-institute — admin view)
CREATE INDEX idx_notif_unread
  ON notification_recipients(student_id, is_read)
  WHERE is_read = false AND is_dismissed = false;
```

#### Pattern C — Exam Time Window Queries (cron-critical)

```sql
-- Auto-transition published → active (runs every 60s)
CREATE INDEX idx_assessments_publish_transition
  ON assessments(start_at)
  WHERE status = 'published' AND is_deleted = false;

-- Auto-transition active → closed (runs every 60s)
CREATE INDEX idx_assessments_close_transition
  ON assessments(end_at)
  WHERE status = 'active' AND is_deleted = false;

-- Cron can use these with: WHERE start_at <= now() and WHERE end_at <= now()
-- These partial indexes are tiny — only 'published' and 'active' rows qualify
-- → Sub-millisecond query time even at 10,000 active assessments
```

#### Pattern D — Auto-Overdue Payment Detection (daily cron)

```sql
-- Auto-overdue cron needs to find old pending payments fast
CREATE INDEX idx_payments_overdue_candidates
  ON payments(institute_id, month, status)
  WHERE status = 'pending' AND is_deleted = false;

-- With this index, the cron query:
--   WHERE status = 'pending'
--   AND (month + interval '1 month' - 1 day + interval '5 days') < now()
-- Hits only pending rows, sorted by month — efficient even at millions of records
```

#### Pattern E — Submission Access During Evaluation

```sql
-- Admin opens evaluation list for an assessment
CREATE INDEX idx_submissions_eval
  ON submissions(assessment_id, status, is_absent)
  WHERE is_deleted = false;  -- submissions table has no is_deleted but
                              -- assessment level soft delete governs visibility

-- Admin opens one student's submission
CREATE INDEX idx_submissions_student_assessment
  ON submissions(assessment_id, student_id);
  UNIQUE  -- already a unique constraint, so also functions as index
```

#### Pattern F — Student Search (multi-field)

```sql
-- GIN for text search on users (name, email, phone)
CREATE INDEX idx_users_search
  ON users USING GIN (
    to_tsvector('english', name || ' ' || COALESCE(email,'') || ' ' || COALESCE(phone,''))
  )
  WHERE is_deleted = false;

-- B-tree for dropdown filters (class, school)
CREATE INDEX idx_students_class  ON students(institute_id, class)  WHERE is_deleted = false;
CREATE INDEX idx_students_school ON students(institute_id, school) WHERE is_deleted = false;

-- Composite for common sort: newest first within institute
CREATE INDEX idx_students_created ON students(institute_id, created_at DESC) WHERE is_deleted = false;
```

### Index Maintenance at Scale

```
CONCERN: GIN indexes are expensive to update (every text mutation rebuilds GIN entry)

MITIGATION:
  fastupdate = on (PostgreSQL default) — GIN defers updates to a pending list,
  batches them at query time or when threshold reached.
  Acceptable for Teachly (student records don't update text fields frequently).

CONCERN: Partial indexes grow as active records grow

MITIGATION:
  Partial indexes with WHERE is_deleted = false only contain active rows.
  Soft-deleted rows never enter these indexes.
  At 1M total student records with 5% deleted: partial index has 950K rows, not 1M.
  VACUUM regularly (Supabase runs autovacuum — monitor via Supabase dashboard).
```

---

## Scalability for Thousands of Institutes

### Load Characteristics

```
Typical institute:
  Students:     50–500
  Materials:    10–200 PDFs
  Assessments:  2–10 active per month
  Admins:       1 (Phase 1)

At 1,000 institutes:
  Total students:    ~150,000
  Total materials:   ~50,000 PDF files
  Concurrent exams:  potentially 50–100 assessments active simultaneously
  Peak: exam start/end times create simultaneous traffic spikes

At 10,000 institutes:
  Total students:    ~1,500,000
  Storage:           ~500,000 PDFs (assume 10MB avg) = ~5 TB MinIO
  DB records:        ~50M submissions, ~180M payment records/year
  Concurrent users:  ~20,000–50,000 at peak
```

### Multi-Tenant Performance Isolation

The most important scalability property: one institute's heavy load must not degrade others.

```
ISOLATION MECHANISM 1 — Query-Level Isolation

  Every query filters by institute_id FIRST.
  PostgreSQL index on (institute_id, ...) means each query touches only
  that institute's data partition in the B-tree.

  Institute A running 10 concurrent queries does NOT slow down Institute B's queries
  because they hit completely different leaf pages in the B-tree.

ISOLATION MECHANISM 2 — Rate Limiting Per IP

  /auth/login: 5 req/15min per IP
  All routes:  100 req/min per IP

  A rogue client from one institute hammering the API is throttled at IP level.
  Other institutes are unaffected.

ISOLATION MECHANISM 3 — Background Job Priority

  BullMQ supports priority queues.
  Time-sensitive jobs (assessment close, email send) → high priority
  Bulk operations (monthly payment generation, bulk upload) → low priority

  A low-priority bulk upload from one large institute does not delay
  assessment auto-submit processing for another institute.

ISOLATION MECHANISM 4 — Connection Pool Fairness

  PgBouncer connection pool is shared. Heavy query from one institute
  could theoretically occupy all connections.

  MITIGATION:
    Set statement_timeout = 30s (Supabase setting) — kills runaway queries
    Set idle_in_transaction_session_timeout = 10s — releases stuck transactions
    Monitor slow query log in Supabase → optimize or cache slow queries
```

### Horizontal Scaling Formula

```
Phase 3 capacity planning:

Each NestJS instance handles:
  ~500–800 req/sec (lightweight JSON API requests)
  ~50–100 req/sec (file upload — limited by I/O)
  Memory: ~150–300 MB per instance (Node.js heap)

At 3 instances + NGINX:
  ~1,500–2,400 req/sec capacity
  Handles ~5,000–10,000 concurrent users (assuming 0.3 req/sec per user avg)

Scale trigger: CPU > 70% sustained OR response p95 > 500ms
Add instance: horizontal scale takes ~2 minutes with container orchestration

Database is the actual ceiling:
  Supabase PostgreSQL free tier: limited connections and IOPS
  Pro tier: dedicated resources, scales to 8 CPU / 32 GB RAM
  At 10,000 institutes: dedicated Supabase plan required
```

---

## AI Async Processing Design

### Phase 2 — Async AI Job Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  AI GENERATION — ASYNC FLOW                                               │
│                                                                           │
│  BEFORE (Phase 1 — synchronous):                                          │
│  Admin → POST /ai-generate → [waits 15 seconds] → gets questions         │
│          ↑                                                                │
│          HTTP connection held open — blocks NestJS thread                 │
│                                                                           │
│  AFTER (Phase 2 — async):                                                 │
│                                                                           │
│  1. Admin → POST /ai-generate                                             │
│             Body: { assessmentId, subject, topic, count, type }           │
│             → Returns immediately: { jobId: "uuid", status: "processing" }│
│                                                                           │
│  2. BullMQ Worker picks up job:                                           │
│     a. Call OpenAI API (up to 30s timeout)                               │
│     b. Parse + validate response                                          │
│     c. On success: SET ai:result:{jobId} = { questions[] }  TTL: 10min   │
│     d. On failure: SET ai:result:{jobId} = { error }        TTL: 10min   │
│                                                                           │
│  3. Frontend polls every 2 seconds:                                       │
│     GET /admin/assessments/ai-status/{jobId}                             │
│     → { status: "processing" | "complete" | "failed" }                   │
│                                                                           │
│  4. On "complete":                                                        │
│     Frontend fetches: GET /admin/assessments/ai-result/{jobId}           │
│     → Questions shown in preview panel for admin review                  │
│     → Job result deleted from Redis after fetch (one-time retrieval)     │
│                                                                           │
│  5. On "failed":                                                          │
│     Show error message: "AI generation failed. Add questions manually."  │
│     Manual entry is always available — AI is optional                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase 3 — Ollama Self-Hosted AI

```
At scale, OpenAI costs become significant:
  10,000 institutes × 10 AI generations/month × ~$0.01/call = $1,000/month

Phase 3 option: Self-hosted Ollama with LLaMA 3

┌────────────────────────────────────────────────────────────────────────┐
│  AI SERVICE ADAPTER PATTERN                                             │
│                                                                         │
│  AiService                                                              │
│    │                                                                    │
│    ├── if AI_PROVIDER = 'openai'  → OpenAiAdapter                      │
│    │     model: gpt-3.5-turbo                                           │
│    │     endpoint: api.openai.com                                       │
│    │                                                                    │
│    └── if AI_PROVIDER = 'ollama'  → OllamaAdapter                      │
│          model: llama3 (or configured model)                            │
│          endpoint: OLLAMA_ENDPOINT (self-hosted VPS)                    │
│          GPU required for reasonable generation speed                   │
│                                                                         │
│  Swap AI provider by changing AI_PROVIDER env var.                     │
│  No code changes in any module — only the adapter changes.             │
└────────────────────────────────────────────────────────────────────────┘

Prompt engineering must work identically for both providers.
Response schema validated before returning to admin regardless of provider.
```

---

## Caching Strategy Summary

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  REDIS KEY DESIGN — COMPLETE MAP                                               │
│                                                                               │
│  KEY PATTERN                          │ TTL   │ INVALIDATION                  │
│  ─────────────────────────────────────┼───────┼───────────────────────────── │
│  dashboard:stats:{institute_id}       │ 5 min │ TTL only                      │
│  features:{institute_id}              │ 15 min│ On feature toggle             │
│  session:{user_id}                    │ 16 min│ On login/logout/delete        │
│  presigned:{inst_id}:{path_hash}      │ 5 min │ TTL only                      │
│  throttle:{endpoint}:{ip}             │ window│ TTL (rate limit window)       │
│  ai:result:{jobId}                    │ 10 min│ After fetch (one-time)        │
│  bulk_upload:result:{jobId}           │ 30 min│ After fetch (one-time)        │
│  bull:queue:assessment.close          │ —     │ BullMQ managed                │
│  bull:queue:payments.generate         │ —     │ BullMQ managed                │
│  bull:queue:email.send                │ —     │ BullMQ managed                │
│  bull:queue:ai.generate               │ —     │ BullMQ managed                │
└──────────────────────────────────────────────────────────────────────────────┘

REDIS MEMORY ESTIMATE AT 1,000 INSTITUTES:
  dashboard stats:   1,000 keys × 500 bytes   = 0.5 MB
  feature flags:     1,000 keys × 200 bytes   = 0.2 MB
  sessions:          50,000 keys × 300 bytes  = 15 MB  (50K active users)
  presigned URLs:    5,000 keys × 500 bytes   = 2.5 MB
  rate limits:       variable                 = ~5 MB
  job queues:        variable                 = ~10 MB
  ─────────────────────────────────────────────────────
  TOTAL:             ~35 MB  (Redis handles millions of keys easily in 256MB instance)
```

---

## Scaling Transition Triggers

```
PHASE 1 → PHASE 2
  Trigger any of:
    ✓ Dashboard load time > 2 seconds consistently
    ✓ Feature flag DB queries appearing in slow query log
    ✓ AI generation causing HTTP timeouts
    ✓ Bulk upload requests timing out
    ✓ > 200 concurrent users during exam events

PHASE 2 → PHASE 3
  Trigger any of:
    ✓ Single NestJS instance CPU > 70% sustained during peak
    ✓ API response p95 > 500ms with Redis in place
    ✓ bcrypt wait times causing auth slowdowns (> 50 concurrent logins)
    ✓ > 500 concurrent users
    ✓ > 500 institutes active

PHASE 3 → BEYOND
  When the PostgreSQL primary becomes the bottleneck:
    → Add read replicas (Supabase pro allows this)
    → Partition large tables (audit_logs, submissions, payments)
    → Consider time-series DB for audit logs (TimescaleDB on Supabase)
    → Evaluate moving to dedicated PostgreSQL cluster
```

---

## Scalability Quick Reference

```
┌───────────────────────────────────────────────────────────────────────────┐
│  PHASE 1 (NOW)         PHASE 2 (GROWTH)        PHASE 3 (SCALE)           │
│                                                                            │
│  1 NestJS instance     1 NestJS + workers       3+ NestJS + NGINX LB     │
│  No cache              Redis for hot data       Redis cluster             │
│  Inline jobs           BullMQ job queue         BullMQ + worker fleet     │
│  Memory rate limit     Redis rate limit         Redis rate limit (global) │
│  Blocking AI calls     Async AI jobs            Async AI + Ollama option  │
│  DB for everything     DB + Redis hybrid        DB + Redis + read replica │
│  No CDN                No CDN                   Cloudflare CDN            │
│                                                                            │
│  < 100 institutes      100–1,000 institutes     1,000–10,000 institutes  │
│  < 5K students         < 100K students          < 1.5M students          │
│  Dev + early beta      Growth stage             Production scale          │
└───────────────────────────────────────────────────────────────────────────┘
```
