# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IMS Portal is a multi-tenant SaaS Institute Management System for tuition centres and small institutes. Each institute registers, selects features, and gets a dynamically configured portal with only those features enabled.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS (+ optional Shadcn UI) |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL hosted on **Supabase** (free tier, dev + prod) |
| Auth | JWT (access + refresh tokens), bcrypt |
| File Storage | Local (dev) → MinIO (prod) |
| Cache | Redis (Phase 2+) |
| AI | OpenAI free tier (initial) → Ollama/LLaMA (later) |

---

## Non-Negotiable Architecture Rules

### 1. Layered Architecture — strictly enforced
```
Frontend (Next.js) → Backend API (NestJS) → Database (Supabase PostgreSQL)
```
**Frontend must NEVER access the database directly. Every operation goes through the backend API.**

### 2. Multi-Tenancy
Every database table must include `institute_id`. Every query must filter by `institute_id`. Injected from JWT by middleware — never trusted from request body.

### 3. Single Active Session
`users` table stores `session_id`. On every login a new `session_id` is generated and embedded in the JWT. Every request compares JWT `session_id` vs DB — mismatch = force logout.

### 4. Soft Delete
Never hard-delete rows. Always use `is_deleted = true` + `deleted_at` + `deleted_by`. All queries filter `is_deleted = false` by default.

### 5. Audit Logging
All mutations (student edits, payment updates, assessment creation, marks updates, material edits) must write to `audit_logs` table.

### 6. Feature Toggles
At admin sign-up, features are selected: Students Data, Study Materials, Assessments, Payments, AI Generation. Only enabled features appear in sidebar and portal. Backend routes enforce feature guards too.

---

## Database Performance
Indexes must be created on: `institute_id`, `student_id`, `email`, `created_at` for all major tables.

---

## Environment Configuration

| Environment | Database | File Storage | Server |
|---|---|---|---|
| Development | Local PostgreSQL | Local filesystem | Local NestJS |
| Production | Supabase PostgreSQL | MinIO | VPS (future phase) |

Environment variables must cover: `DATABASE_URL`, `JWT_SECRET`, `STORAGE_CONFIG`, `AI_API_KEY`

---

## Feature Toggles (5 modules)

| Feature key | Admin capability | Student capability |
|---|---|---|
| `students` | Full CRUD, bulk Excel upload | — |
| `materials` | Upload, edit, hide, delete cards | View-only cards, search in doc, watermarked |
| `assessments` | Create, evaluate, grade | Submit answers + images, view marks |
| `payments` | Track status per month, edit | — |
| `ai_generation` | Generate assessment questions via AI | — |

---

## Key Business Rules

- **Layered access:** Frontend → API → DB always. No direct DB access from frontend.
- **Study Materials (student view):** View-only, no download, disable right-click, disable print, watermark shows student's own name, in-document word search enabled. Note: screenshot prevention cannot be guaranteed in browsers.
- **Assessments:** Locked until start time, auto-unlock; workflow: Generate → Review → Upload → Set timeline
- **Payments:** Track last 10 months per student; green/red status indicator
- **Students bulk upload:** Requires downloadable Excel template; column validation on upload; reject file if columns mismatch
- **Notifications:** Broadcast (all students) and targeted (specific students); unread badge

---

## UI Design System

- **Layout:** Card-based throughout — Study Materials and Assessments always use cards
- **Colors:** Soft blue (primary) · light grey (bg) · white (cards) · soft dark navy (text) · soft green (success) · muted orange (warning) · soft red (error)
- **Typography:** Inter or Poppins
- **Style:** Rounded corners, soft shadows, hover effects, clean sidebar navigation

---

## Development Phases

| Phase | Scope |
|---|---|
| 1 | Auth, multi-tenant setup, Students CRUD, feature toggles |
| 2 | Study materials, basic assessments |
| 3 | AI integration, payments |
| 4 | Notifications, attendance |
| 5 | Role hierarchy, super admin, teacher role |

---

## Scalability Path

1. **MVP:** Single NestJS instance + Supabase PostgreSQL + rate limiting + pagination + DB indexes
2. **Mid:** Add Redis caching (dashboard stats, feature flags)
3. **Scale:** Move to VPS + NGINX reverse proxy + multiple NestJS instances
