# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IMS Portal is a multi-tenant SaaS Institute Management System for tuition centres and small institutes. This repository currently contains the requirements specification and architecture docs. No source code exists yet — development follows the phased roadmap below.

## Planned Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS (+ optional Shadcn UI) |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens), bcrypt |
| File Storage | Local (dev), MinIO (prod) |
| Cache | Redis (Phase 2+) |
| AI | OpenAI free tier (initial), Ollama/LLaMA (later) |

## Architecture

### Multi-Tenancy
Every database table must include `institute_id`. Every query must filter by `institute_id`. This is the primary data isolation boundary — never omit it.

### Single Active Session
Users table stores a `session_id`. On login, a new `session_id` is generated and embedded in the JWT. Every request validates JWT `session_id` against DB — mismatch triggers force logout.

### Soft Delete
Never hard-delete rows. Use `is_deleted = true`, `deleted_at` (timestamp), `deleted_by`. All queries must filter `is_deleted = false` by default.

### Audit Logging
All mutations (student edits, payment updates, assessment creation, marks updates, material edits) must be written to the `audit_logs` table.

### Feature Toggles
At admin sign-up, features are selected: Students Data, Study Materials, Assessments, Payments, AI Generation. Only enabled features appear in the admin sidebar and student portal. Backend routes must also enforce feature-based access control.

## Development Phases

| Phase | Scope |
|---|---|
| 1 | Auth, multi-tenant setup, Students CRUD, feature toggles |
| 2 | Study materials, basic assessments |
| 3 | AI integration, payments |
| 4 | Notifications, attendance |
| 5 | Role hierarchy, super admin, teacher role |

## UI Design System

- **Layout:** Card-based throughout (Study Materials, Assessments always use cards)
- **Colors:** Soft blue (primary), light grey (background), white (cards), soft dark navy (text)
- **Typography:** Inter or Poppins
- **Style:** Rounded corners, soft shadows, hover effects, clean sidebar navigation

## Key Business Rules

- **Study Materials (student view):** View-only, no download, watermark on viewer
- **Assessments:** Locked until start time, auto-unlock; workflow is Generate → Review → Upload → Set timeline
- **Payments:** Track last 10 months per student; status shown as green/red indicator
- **Students bulk upload:** Excel format with column validation; reject file on column mismatch
- **Notifications:** Support broadcast (all students) and targeted (specific students); show unread badge
