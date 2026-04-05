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
| MCQ evaluation | Typed MCQ → auto-evaluated, read-only in evaluation UI. Uploaded MCQ → admin clicks ✓/✗ toggle per question, system calculates marks. Admin never types MCQ marks manually |
| Evaluation layout | Left panel: question list with marks input / ✓✗ toggle / comment per question + live running total + Finalise button. Right panel: submission viewer (typed text or image/PDF inline). Same layout for all submission types |
| Negative marking | Admin decides per assessment. If enabled, admin sets deduction value per wrong MCQ. Unattempted always = 0. Total capped at 0 — never goes negative |
| Unattempted questions | Shows "Not attempted" in evaluation view. Marks field empty — admin enters 0 manually if needed |
| Absent students | Never submitted = Absent badge in evaluation list. Marks auto-set to 0. No evaluation action needed |
| Results release | Admin can release per individual student OR release all at once. Marks always editable after release — no lock. Students see updated marks immediately |
| Results visibility | Students see per-question marks breakdown + admin feedback per answer, after results released |
| Admin evaluation UI | Student-by-student navigation. Typed answers + uploaded files inline side by side. Mixed submissions: both visible, admin enters one set of marks. Upload-only: admin chooses per-question marks or single total. Progress bar + per-student badge. Marks auto-save as typed + Finalise button at end |
| Quick entry mode | Table view for rapid total marks entry per student — for upload-only or simple assessments. Can be mixed with detailed mode |
| Assessment stats | After finalising: highest, lowest, average, evaluated count, absent count. Auto-updates if marks edited |
| Flag for review | Admin can flag individual answers during evaluation. Internal only — students never see flags |
| Student performance history | Per-student view of all assessment marks across time. Read-only. Accessible from student profile |
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
| Search fields — students | Name, email, phone, roll number, class, school (real-time) |
| Student grid columns | Name, Email, Phone, Class, School, Parent Name, Parent Phone, Joined Date + credential status indicator |
| Soft delete — students | Permanent — cannot be restored. Active sessions invalidated immediately on delete |
| Dashboard stats caching | Phase 1: fresh on load. Phase 2: Redis 5-min TTL |
| Upcoming assessments | All published or active assessments (no date range filter) |
| Pending payments card | Shows both count of students with pending/overdue AND total amount |
| Payment records | Auto-generated monthly (1st of month) for all active students. New student joining mid-month gets full month charge |
| Payment export | Bulk Excel export of all payment records. No individual PDF receipts |
| Notification types | General / Payment reminder / Assessment reminder — in-app only, no email/SMS in V1 |
| Notification bell | In the header for both admin and student |
| Notifications expiry | Never expire — stay until admin deletes. Admin delete removes from all students immediately |
| Student dismiss notifications | Yes — students can dismiss from their own list only |
| Notification max length | 500 characters |
| Assessment visibility | All students in the institute — no batch/class filtering |
| Materials visibility | All students in the institute — no batch/class filtering |
| Materials search/filter | Admin and students can filter by subject, sort by date, search by name/subject/author (real-time) |
| Edit published assessment | Yes — admin can edit at any status |
| Delete assessment | Yes — soft delete at any status. Submissions also hidden |
| Duplicate assessment | Yes — creates new draft with same questions and settings |
| Publish 0 questions | Blocked — must have at least 1 question |
| Assessment instructions | Optional field shown to students on card and before starting |
| Exam timer | No countdown. Student sees start datetime and end datetime (IST) on card only |
| Empty submission | Auto-submit at end_at creates a submission record even if student answered nothing |
| Student dashboard | Yes — summary cards: upcoming assessments, unread notifications, recent materials |
| Student can update email | No — email is managed by admin only |
| Loading states | Skeleton loaders for all data-fetching operations |
| Confirmation dialogs | Required for all destructive actions (delete student, material, assessment, notification) |
| Toast notifications | All create/update/delete/error actions show toast |
| Mobile evaluation layout | Panels stack vertically — viewer on top, marks panel below |
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

Required: `Name`, `Email`, `Phone`, `Class`, `School`
Optional: `Roll Number`, `Date of Birth`, `Address`, `Parent Name`, `Parent Phone`, `Batch`, `Joined Date`
Optional columns can be blank. Missing/renamed required columns → entire file rejected.
Duplicate emails → row skipped, reported to admin in summary.
System provides a downloadable sample Excel template with headers + one example row.

## Add Student Form Fields

Required: name, email, phone, class, school
Optional: roll number, date of birth, address, parent name, parent phone, batch, joined date
Password is auto-generated by the system — admin does not set it manually.

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
