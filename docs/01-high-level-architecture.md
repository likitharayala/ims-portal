# IMS Portal — High Level Architecture (Section 1)

**Source of truth:** IMS Portal Requirements Summary
**Hard rule enforced throughout:** Frontend must never access the database directly. Every operation goes through the NestJS backend API.

---

## 1. Layered Architecture

The system is built on a strict 4-layer model. No layer may bypass the one below it.

```
╔══════════════════════════════════════════════════════════════════════╗
║                     LAYER 1 — CLIENT                                ║
║                                                                      ║
║   ┌─────────────────────────────┐  ┌──────────────────────────────┐ ║
║   │     Admin Browser           │  │     Student Browser          │ ║
║   │                             │  │                              │ ║
║   │  Next.js + TypeScript       │  │  Next.js + TypeScript        │ ║
║   │  Tailwind CSS               │  │  Tailwind CSS                │ ║
║   │  Role-aware sidebar         │  │  Feature-filtered sidebar    │ ║
║   │  Card-based UI              │  │  Read-only UI                │ ║
║   │  Admin dashboard            │  │  Secure doc viewer           │ ║
║   └────────────┬────────────────┘  └──────────────┬───────────────┘ ║
╚════════════════╪══════════════════════════════════╪═════════════════╝
                 │  HTTPS + JSON (REST)              │
                 └──────────────┬────────────────────┘
                                │
╔═══════════════════════════════╪══════════════════════════════════════╗
║              LAYER 2 — API GATEWAY                                   ║
║                               │                                      ║
║   ┌───────────────────────────▼────────────────────────────────┐    ║
║   │                     NGINX                                   │    ║
║   │   • SSL termination (HTTPS enforcement)                     │    ║
║   │   • Rate limiting (per IP + per institute)                  │    ║
║   │   • Route forwarding → NestJS on internal port             │    ║
║   │   • Static asset serving (Phase 2+)                        │    ║
║   └───────────────────────────┬────────────────────────────────┘    ║
╚═══════════════════════════════╪══════════════════════════════════════╝
                                │
╔═══════════════════════════════╪══════════════════════════════════════╗
║          LAYER 3 — APPLICATION (NestJS Backend API)                  ║
║                               │                                      ║
║   ┌───────────────────────────▼────────────────────────────────┐    ║
║   │                  Middleware Pipeline                         │    ║
║   │   RateLimit → InstituteContext → JwtAuth → Roles → Feature  │    ║
║   └───────────────────────────┬────────────────────────────────┘    ║
║                               │                                      ║
║   ┌──────────┬────────────┬─────────────┬───────────┬───────────┐   ║
║   │   Auth   │  Students  │  Materials  │Assessments│  Payments  │   ║
║   │  Module  │  Module    │  Module     │  Module   │  Module    │   ║
║   └──────────┴────────────┴─────────────┴───────────┴───────────┘   ║
║   ┌───────────────────────────────────────────────────────────────┐  ║
║   │  Notifications Module                                         │  ║
║   │  Cron Jobs: PaymentAutoGenerate (monthly) │ AutoOverdue(daily)│  ║
║   └───────────────────────────────────────────────────────────────┘  ║
║                                                                      ║
║   ┌──────────────────────────────────────────────────────────────┐   ║
║   │               Shared Services                                │   ║
║   │   AuditLog │ FileUpload │ AI Service │ ExcelTemplate         │   ║
║   │   EmailService (Nodemailer + Gmail SMTP)                     │   ║
║   └──────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════╝
                                │
╔═══════════════════════════════╪══════════════════════════════════════╗
║          LAYER 4 — INFRASTRUCTURE                                    ║
║                               │                                      ║
║   ┌──────────────┐  ┌─────────┴──────┐  ┌──────────┐  ┌─────────┐  ║
║   │   Supabase   │  │   MinIO        │  │  OpenAI  │  │  Redis  │  ║
║   │  PostgreSQL  │  │ (File Storage) │  │ /Ollama  │  │ (P2+)   │  ║
║   │              │  │                │  │          │  │         │  ║
║   │  Primary DB  │  │ /{inst_id}/    │  │ AI gen   │  │ Cache   │  ║
║   │  All data    │  │  /materials/   │  │          │  │ Rate    │  ║
║   │  Auto backup │  │  /profiles/    │  │          │  │ limit   │  ║
║   └──────────────┘  └────────────────┘  └──────────┘  └─────────┘  ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 2. Component Interaction Map

```
                        ┌─────────────────────────────────────────────┐
                        │           Next.js Frontend                   │
                        │                                             │
                        │  ┌───────────┐  ┌───────────┐  ┌────────┐  │
                        │  │  Admin    │  │  Student  │  │  Auth  │  │
                        │  │  Pages    │  │  Pages    │  │  Pages │  │
                        │  └─────┬─────┘  └─────┬─────┘  └───┬────┘  │
                        │        │               │            │       │
                        │  ┌─────▼───────────────▼────────────▼────┐  │
                        │  │         API Service Layer              │  │
                        │  │   axios/fetch → /api/* endpoints       │  │
                        │  │   Attaches Bearer token automatically  │  │
                        │  └─────────────────────┬──────────────────┘  │
                        │                        │  HTTPS              │
                        │   ✗ Never direct DB    │                     │
                        │   ✗ Never direct MinIO │                     │
                        └────────────────────────┼─────────────────────┘
                                                 │
                        ┌────────────────────────▼─────────────────────┐
                        │              NestJS Backend API               │
                        │                                               │
                        │  ┌─────────────────────────────────────────┐ │
                        │  │           Guard Chain (in order)         │ │
                        │  │  1. RateLimitGuard                       │ │
                        │  │  2. InstituteContextMiddleware           │ │
                        │  │  3. JwtAuthGuard + session_id check      │ │
                        │  │  4. RolesGuard (@Roles decorator)        │ │
                        │  │  5. FeatureGuard (@RequiresFeature)      │ │
                        │  └─────────────────────┬───────────────────┘ │
                        │                        │                     │
                        │  ┌─────────────────────▼───────────────────┐ │
                        │  │         Module Controllers               │ │
                        │  │   → Services → Repositories             │ │
                        │  │   All queries include institute_id       │ │
                        │  │   All mutations write to audit_logs      │ │
                        │  └─────────────────────┬───────────────────┘ │
                        └────────────────────────┼─────────────────────┘
                                  ┌──────────────┼──────────────┬──────────────┐
                                  ▼              ▼              ▼              ▼
                           Supabase DB        MinIO         OpenAI       Gmail SMTP
                           (via DATABASE_URL) (files)      (AI gen)   (Nodemailer)
```

---

## 3. Request Lifecycle

Every request passes through a deterministic 8-stage pipeline. Stages are ordered to fail fast on the cheapest checks first.

```
Incoming HTTPS Request
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1 — NGINX                                                     │
│                                                                      │
│  • Terminate SSL                                                     │
│  • Rate limit check (per IP):                                        │
│      /auth/login    → 5 req / 15 min                                │
│      /auth/signup   → 3 req / hour                                  │
│      /auth/refresh  → 10 req / 15 min                               │
│      all other      → 100 req / min                                 │
│  • Forward to NestJS on internal port                               │
│  → 429 Too Many Requests if exceeded                                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 2 — InstituteContextMiddleware (NestJS Global Middleware)     │
│                                                                      │
│  • Skip if route is @Public()                                        │
│  • Decode JWT (no verification yet — just read payload)             │
│  • Extract institute_id, user_id, role                              │
│  • Bind to request context:                                         │
│      req.instituteId = payload.institute_id                         │
│      req.userId      = payload.sub                                  │
│      req.role        = payload.role                                 │
│                                                                      │
│  Purpose: institute_id is NEVER read from req.body anywhere         │
│  in the application — always from req.instituteId (trusted)         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 3 — JwtAuthGuard                                              │
│                                                                      │
│  • Skip if route is @Public()                                        │
│  • Verify JWT signature using ACCESS_SECRET                         │
│  • Check token expiry                                               │
│  • Extract session_id from JWT payload                              │
│  • Query: SELECT session_id FROM users WHERE id = payload.sub       │
│  • Compare JWT.session_id === DB.session_id                         │
│      Match   → attach user to req.user, continue                   │
│      Mismatch → 401 { code: 'SESSION_INVALIDATED' }                │
│                 (frontend shows "Logged in elsewhere")              │
│  → 401 Unauthorized if token invalid or expired                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 4 — RolesGuard                                                │
│                                                                      │
│  • Read @Roles('admin') or @Roles('student') from route decorator   │
│  • Compare with req.user.role from JWT                              │
│  → 403 Forbidden if role does not match                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 5 — FeatureGuard                                              │
│                                                                      │
│  • Read @RequiresFeature('materials') from route decorator          │
│  • Query institute_features WHERE institute_id = req.instituteId    │
│    (cached in Redis Phase 2)                                        │
│  • Check if required feature key is in enabled list                 │
│  → 403 { code: 'FEATURE_NOT_ENABLED' } if not enabled              │
│    (frontend shows upgrade prompt)                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 6 — Controller → Service → Repository (Business Logic)       │
│                                                                      │
│  • All DB queries auto-include:                                     │
│      WHERE institute_id = req.instituteId                           │
│      AND   is_deleted   = false                                     │
│  • All mutating operations call:                                    │
│      AuditLogService.record(actor, action, resource, old, new)      │
│  • File operations routed to FileUploadService → MinIO             │
│  • AI operations routed to AiService → OpenAI/Ollama               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 7 — Response Serialisation                                    │
│                                                                      │
│  Standard envelope applied to all responses:                        │
│  {                                                                   │
│    "success": true | false,                                         │
│    "data":    <payload>,                                            │
│    "meta":    { page, limit, total },   ← on list endpoints        │
│    "error":   { code, message }         ← on failures              │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Multi-Tenant Isolation Strategy

```
Institute A (institute_id: aaa-111)       Institute B (institute_id: bbb-222)
          │                                         │
          │  JWT.institute_id = aaa-111             │  JWT.institute_id = bbb-222
          │                                         │
          ▼                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NestJS Backend                              │
│                                                                 │
│   InstituteContextMiddleware binds institute_id to request      │
│   Repositories inject it into every query automatically         │
│                                                                 │
│   institute_id from JWT  ←────  TRUSTED                        │
│   institute_id from body ←────  IGNORED / OVERRIDDEN           │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                            │
│                                                                 │
│   SELECT * FROM students                                        │
│   WHERE institute_id = 'aaa-111'    ← always injected          │
│   AND   is_deleted   = false        ← always injected          │
│                                                                 │
│   Institute B data is never returned — not by access control   │
│   but by query construction. Even a bug cannot leak data       │
│   across tenants without also bypassing the middleware.         │
└─────────────────────────────────────────────────────────────────┘
```

**Four enforcement boundaries:**

| Boundary | Mechanism | Failure result |
|---|---|---|
| JWT | `institute_id` signed into token — cannot be forged | Token rejected |
| Middleware | `InstituteContextMiddleware` extracts and binds `institute_id` | Request fails before business logic |
| Repository | Every query hard-codes `WHERE institute_id = req.instituteId` | Empty result set — never cross-tenant data |
| Storage | MinIO path prefix: `/{institute_id}/{resource}/{file}` | File not found across tenants |

---

## 5. Feature Toggle Architecture

Features are selected at admin sign-up and stored in the `institute_features` table. They control three surfaces simultaneously:

```
Admin Sign-Up
     │
     │  Selects: [students, materials, assessments]
     ▼
institute_features table
┌──────────────────────────────────────────────────────┐
│  institute_id = aaa-111                              │
│  features = [students, materials, assessments]       │
└──────────────────────────────────────────────────────┘
                    │
     ┌──────────────┼──────────────────┐
     │              │                  │
     ▼              ▼                  ▼
/auth/me       FeatureGuard       Next.js Layout
returns        blocks routes      renders sidebar
features[]     without enabled    from features[]
               feature → 403      only

     │              │                  │
     ▼              ▼                  ▼
Admin sees:    API enforces:      Student sees:
✓ Students     ✓ /admin/students  ✓ Materials tab
✓ Materials    ✓ /admin/materials ✗ Payments tab
✓ Assessments  ✗ /admin/payments  ✓ Assessments tab
✗ Payments     ✗ /admin/ai        ✗ AI tab
✗ AI
```

**Guard decorator pattern:**
```typescript
@RequiresFeature('assessments')   // FeatureGuard checks institute_features
@Roles('admin')                   // RolesGuard checks JWT role
@Get('/assessments')
getAssessments() { ... }
```

**Mid-session feature disable:**
If admin disables a feature while a student is actively on that module, the student's **next API call** returns `403 FEATURE_NOT_ENABLED`. The frontend catches this and shows "This feature is not available" then redirects to dashboard. No data is deleted — re-enabling restores everything.

**Institute name in UI:**
The institute's name (from `institutes.name`) is displayed in the sidebar header for all logged-in users (admin and student). Loaded as part of the `/auth/me` response.

---

## 6. Session Validation Flow

```
LOGIN
  │
  ├─ Generate new session_id (UUID)
  ├─ UPDATE users SET session_id = new_uuid
  ├─ INSERT sessions (refresh_token_hash, ip, user_agent, expires_at)
  ├─ Sign access_token  { sub, institute_id, role, session_id }  exp: 15m
  ├─ Sign refresh_token { sub, session_id, type: 'refresh' }     exp: 7d
  └─ Return { access_token, refresh_token, user: { role, features[] } }

EVERY AUTHENTICATED REQUEST
  │
  ├─ Decode JWT → extract session_id
  ├─ SELECT session_id FROM users WHERE id = sub
  ├─ Compare:
  │     JWT.session_id == DB.session_id  →  proceed
  │     JWT.session_id != DB.session_id  →  401 SESSION_INVALIDATED
  │
  └─ Why this works: new login overwrites session_id in DB
     Old device still has old session_id in JWT
     Next request from old device → mismatch → force logged out

LOGOUT
  │
  ├─ UPDATE sessions SET revoked_at = now()
  └─ UPDATE users SET session_id = NULL
```

**Token storage on frontend:**

| Token | Storage | Reason |
|---|---|---|
| `access_token` | JS memory (Zustand store) | Never persisted — immune to XSS persistent theft |
| `refresh_token` | `httpOnly` cookie (`Path=/auth/refresh`, `SameSite=Strict`) | JS cannot read it — immune to XSS |

---

## 7. Admin vs Student Access Separation

```
┌──────────────────────────────────────────────────────────────────────┐
│                         NestJS Backend                               │
│                                                                      │
│   JwtAuthGuard extracts role from JWT                                │
│                    │                                                 │
│         ┌──────────┴──────────┐                                      │
│         │                     │                                      │
│         ▼                     ▼                                      │
│   role = 'admin'        role = 'student'                             │
│         │                     │                                      │
│   /admin/* routes       /student/* routes                            │
│   @Roles('admin')       @Roles('student')                            │
│         │                     │                                      │
│         ▼                     ▼                                      │
│   ┌───────────────┐    ┌──────────────────┐                          │
│   │ Full CRUD on: │    │ Read-only on:    │                          │
│   │ • Students    │    │ • Own profile    │                          │
│   │ • Materials   │    │ • Materials      │                          │
│   │ • Assessments │    │ • Assessments    │                          │
│   │ • Payments    │    │ • Notifications  │                          │
│   │ • Notifs      │    │                  │                          │
│   │               │    │ Write-only on:   │                          │
│   │ Evaluation    │    │ • Submissions    │                          │
│   │ Dashboard     │    │ • Answer uploads │                          │
│   │               │    │ • Own password   │                          │
│   │               │    │ • Dismiss notifs │                          │
│   └───────────────┘    └──────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Frontend separation (Next.js middleware.ts):**

```
Request path check (runs on every navigation):

/admin/**   → if JWT.role !== 'admin'   → redirect /login
/student/** → if JWT.role !== 'student' → redirect /login
/login      → if authenticated          → redirect to role dashboard
/           → landing page (public)
```

**Document viewer — student-specific security controls:**

The study materials viewer enforces 4 security controls for students:

```
Student opens material
        │
        ▼
┌───────────────────────────────────────────┐
│  Secure Document Viewer Component         │
│                                           │
│  ✓ Download button — disabled/hidden      │
│  ✓ Right-click — event.preventDefault()  │
│  ✓ Print — CSS @media print { display:   │
│    none } + beforeprint event blocked     │
│  ✓ Watermark — student's own name        │
│    overlaid across document               │
│  ✓ Word search — in-document text search  │
│                                           │
│  Note: screenshot prevention cannot be   │
│  guaranteed in browsers — by design      │
└───────────────────────────────────────────┘
```

---

## 8. Environment Configuration

Two environments with distinct infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│  DEVELOPMENT                                                     │
│                                                                 │
│  Next.js (localhost:3000)                                       │
│       ↓                                                         │
│  NestJS (localhost:3001)                                        │
│       ↓                                                         │
│  Local PostgreSQL (localhost:5432)                              │
│  Local filesystem (./uploads)                                   │
│                                                                 │
│  .env.development:                                              │
│  DATABASE_URL=postgresql://localhost:5432/ims_dev               │
│  JWT_SECRET=dev-secret                                          │
│  JWT_REFRESH_SECRET=dev-refresh-secret                          │
│  STORAGE_TYPE=local                                             │
│  STORAGE_PATH=./uploads                                         │
│  FRONTEND_URL=http://localhost:3000                             │
│  APP_ENV=development                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PRODUCTION                                                      │
│                                                                 │
│  Next.js (Vercel / VPS)                                         │
│       ↓  HTTPS                                                  │
│  NGINX reverse proxy                                            │
│       ↓                                                         │
│  NestJS (VPS)                                                   │
│       ↓                      ↓                    ↓            │
│  Supabase PostgreSQL       MinIO               OpenAI           │
│                                                                 │
│  .env.production:                                               │
│  DATABASE_URL=postgresql://[supabase-connection-string]         │
│  JWT_SECRET=[strong-random-secret]                              │
│  JWT_REFRESH_SECRET=[strong-random-secret]                      │
│  STORAGE_TYPE=minio                                             │
│  MINIO_ENDPOINT=...                                             │
│  MINIO_ACCESS_KEY=...                                           │
│  MINIO_SECRET_KEY=...                                           │
│  MINIO_BUCKET_NAME=ims-portal                                   │
│  OPENAI_API_KEY=...                                             │
│  FRONTEND_URL=https://your-domain.com                           │
│  APP_ENV=production                                             │
│  SMTP_HOST=smtp.gmail.com                                       │
│  SMTP_PORT=587                                                  │
│  SMTP_USER=...                                                  │
│  SMTP_PASS=...  (Gmail App Password)                            │
│  SMTP_FROM=...  (display name + email)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Component Responsibility Summary

| Component | Responsibility |
|---|---|
| Next.js Frontend | UI rendering, role-aware routing, feature-filtered sidebar, secure doc viewer, token management in memory |
| NGINX | SSL termination, rate limiting, reverse proxy to NestJS |
| NestJS Backend | All business logic, all DB access, all file operations, JWT issuance, guard pipeline |
| InstituteContextMiddleware | Extracts and binds `institute_id` from JWT to every request |
| JwtAuthGuard | Verifies token + compares session_id against DB |
| RolesGuard | Enforces admin/student route separation |
| FeatureGuard | Enforces institute-level feature access |
| AuditLogService | Records all mutations — called from every service write operation |
| FileUploadService | Handles all MinIO interactions; paths: `/{institute_id}/materials/{id}.pdf`, `/{institute_id}/profiles/{id}.{ext}` |
| AiService | Wraps OpenAI/Ollama calls for assessment generation |
| EmailService | Nodemailer + Gmail SMTP — sends verification emails and password reset links |
| ExcelTemplateService | Generates downloadable template + validates uploaded Excel on bulk student import |
| NotificationsModule | In-app notifications — admin creates, students receive; unread badge count via `notification_recipients` |
| PaymentCronService | Two cron jobs: (1) 1st of month — auto-create pending records for all active students; (2) daily — transition pending→overdue after 5-day grace period |
| Supabase PostgreSQL | Primary data store — all tables, all tenants, accessed only by NestJS |
| MinIO | File storage — study materials, student profile photos; pre-signed 15-min URLs |
