# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IMS Portal is a multi-tenant SaaS Institute Management System for tuition centres and small institutes. Each institute registers, selects features, and gets a dynamically configured portal.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS (+ optional Shadcn UI) |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL hosted on **Supabase** |
| Auth | JWT (access 15m + refresh 7d), bcrypt rounds=12 |
| File Storage | Local `./uploads` (dev) → MinIO (prod) |
| File URLs | Pre-signed, time-limited (15 min expiry) — never permanent public URLs |
| Cache | Redis Phase 2+ |
| AI | OpenAI free tier → Ollama/LLaMA |

---

## Non-Negotiable Architecture Rules

### 1. Layered Architecture
```
Frontend (Next.js) → Backend API (NestJS) → Database (Supabase PostgreSQL)
```
Frontend must **never** access the database directly. Every operation goes through the NestJS API.

### 2. Multi-Tenancy
`institute_id` on every table. Every query filters by it. Always injected from JWT by middleware — never from request body.

### 3. Single Active Session
`users.session_id` overwritten on every login. Every request compares JWT `session_id` vs DB — mismatch = 401 force logout.

### 4. Soft Delete
Never hard-delete. Always `is_deleted = true` + `deleted_at` + `deleted_by`. All queries filter `is_deleted = false`.

### 5. Audit Logging
All mutations write to `audit_logs` (append-only, never updated or deleted).

### 6. Feature Toggles
5 features: `students`, `materials`, `assessments`, `payments`, `ai_generation`. When disabled — data is **hidden, not deleted**. Re-enabling restores all data.

### 7. Timezone
All timestamps stored UTC. All UI displays in **IST (UTC+5:30)**. Assessment times set in IST by admin.

---

## Resolved Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Student credential delivery | Admin creates student → system generates temp password → admin shares manually → student forced to change on first login |
| Bulk upload credentials | One-time downloadable CSV of email + temp passwords after upload |
| Forgot password | Email reset link, expires 30 minutes, invalidates all sessions |
| Email verification | Required on admin signup before dashboard access |
| Can students send notifications? | No — students receive only. No student-to-admin messaging in V1 |
| Payments — is there a gateway? | No. Manual tracking only. Status: pending / paid / overdue |
| Fee amount | Set per student at creation. Same every month until admin changes it. Change applies from next month — past months unaffected |
| Overdue status | Auto-set by daily `@Cron` job — pending payments become overdue 5 days after the month ends (e.g. Jan → overdue Feb 6). Admin can manually override in either direction. Cron ONLY touches `pending` records — never `paid` or `overdue`. Overdue is sticky: stays overdue until admin explicitly marks it paid. System never auto-marks anything as paid |
| Assessment submission modes | Both modes always available on every assessment: (1) Online — type MCQ selections + descriptive text; (2) Upload — upload handwritten answer sheet (JPG/PNG/PDF, 20MB total). Student can use both simultaneously |
| Assessment auto-submit | Yes — auto-submits at `end_at` if student hasn't submitted |
| Assessment auto-save | Yes — every 60 seconds during active exam |
| MCQ auto-evaluation | Auto-evaluated when assessment closes. Admin triggers final total calculation |
| Negative marking | Admin decides per assessment. If enabled, admin sets deduction value per wrong MCQ. Unattempted always = 0 |
| Unattempted questions | Shows "Not attempted" in evaluation view. Marks field empty — admin enters 0 manually if needed |
| Results visibility | Students see per-question marks breakdown + admin feedback per answer, after `results_released = true` |
| Admin evaluation UI | Student-by-student navigation. Typed answers + uploaded files inline side by side. Mixed submissions: both visible, admin enters one set of marks. Upload-only: admin chooses per-question marks or single total. Progress bar + per-student badge. Marks auto-save as typed + Finalise button at end |
| Can admin mix AI + manual questions? | Yes |
| AI generation failure fallback | Show error, allow manual entry |
| Feature disable behaviour | Data hidden, not deleted. Re-enable restores everything |
| Multiple admins per institute | Phase 1: single admin only. Phase 5: multiple with hierarchy |
| Mid-session hide (materials) | Current session unaffected. Hidden on next open |
| PDF in-document search | Text-based PDFs only (PDF.js). Scanned PDFs cannot be searched — communicated to users |
| Watermark | Student's own name overlaid via CSS/canvas in viewer |
| File types — materials | PDF only, max 50MB, MIME type validated |
| File types — answer images | JPG/PNG only, max 10MB each, max 3 per question |
| Profile photo | JPG/PNG, max 5MB |
| Pagination page size | 20 items per page (fixed) |
| Default sort — students | Join date descending |
| Search fields — students | Name, email, phone, roll number |
| Dashboard stats caching | Phase 1: fresh on load. Phase 2: Redis 5-min TTL |
| Notification types | General / Payment reminder / Assessment reminder — in-app only, no email/SMS in V1 |
| Notifications expiry | Never expire — stay until admin deletes |
| CORS | Frontend domain only |
| MinIO URLs | Pre-signed, 15-minute expiry |
| Mobile responsiveness | Fully responsive — all modules |
| Empty states | Every module has empty state with message + CTA |

---

## File Upload Rules

| Upload type | Allowed formats | Max size | Validation |
|---|---|---|---|
| Study materials | PDF only | 50MB | MIME type + extension both checked |
| Answer sheet upload | JPG, PNG, PDF | 20MB total per submission | MIME type + extension |
| Profile photo | JPG, PNG | 5MB | MIME type + extension |
| Bulk student upload | .xlsx only | — | Column names + MIME type |

---

## Assessment Status Machine

```
draft → published (manual by admin)
     → active     (auto at start_at)
     → closed     (auto at end_at — auto-submits open exams)
     → evaluated  (manual by admin after marking)
```
`results_released` boolean on assessments controls student visibility of marks.

---

## Student Account Flow

1. Admin creates student (form or bulk Excel)
2. System generates temporary password
3. Admin sees/shares credentials (shown once, not stored in plaintext)
4. Bulk upload: admin downloads one-time CSV of credentials
5. Student logs in → forced password change on first login

---

## Excel Bulk Upload Columns

Required: `Name`, `Email`, `Phone`, `Roll Number`, `Batch`, `Date of Birth`, `Parent Name`, `Parent Phone`
Optional columns can be blank. Missing/renamed required columns → entire file rejected.
Duplicate emails → row skipped, reported to admin in summary.

---

## Environment Variables

```
DATABASE_URL          JWT_SECRET             JWT_REFRESH_SECRET
STORAGE_TYPE          MINIO_ENDPOINT         MINIO_ACCESS_KEY
MINIO_SECRET_KEY      MINIO_BUCKET_NAME      OPENAI_API_KEY
FRONTEND_URL          APP_ENV
```
Defined in `.env.example`. Never commit actual `.env` files.

---

## Development Phases

| Phase | Scope |
|---|---|
| 1 | Auth (login, signup, email verify, forgot password), multi-tenant, Students CRUD + bulk upload, feature toggles, institute/admin settings |
| 2 | Study materials + secure viewer, basic assessments |
| 3 | AI assessment generation, payments |
| 4 | Notifications, attendance |
| 5 | Role hierarchy, super admin, teacher role, multiple admins |

---

## UI Rules

- Card layout: Study Materials and Assessments always use cards — no exceptions
- All times displayed in IST
- Every module has an empty state
- Fully mobile responsive
- Colors: soft blue (primary) · light grey (bg) · white (cards) · soft dark navy (text)
- Font: Inter or Poppins
