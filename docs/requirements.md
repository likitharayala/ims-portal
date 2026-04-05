# IMS Portal — Requirements Summary

## Project Vision

IMS Portal is a multi-tenant SaaS-based Institute Management System for tuition centres and small institutes. Each institute registers, selects features, and gets a dynamically configured portal.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| UI Components | Shadcn UI (optional) |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL |
| Authentication | JWT (access + refresh tokens) + bcrypt |
| File Storage | Local (dev) → MinIO (prod) |
| Cache | Redis (Phase 2+) |
| AI | OpenAI free tier → Ollama/LLaMA (later) |

---

## Core System Features

- Multi-tenant architecture (institute_id isolation)
- Role-based access control (Admin, Student)
- Feature-based dynamic rendering
- Soft delete system (`is_deleted`, `deleted_at`, `deleted_by`)
- Audit logging (all mutations tracked)
- Single active session enforcement
- Rate limiting
- Secure file handling

---

## Selectable Features (per institute)

At admin sign-up, institutes choose which modules to enable:

| Feature | Admin Capability | Student Capability |
|---|---|---|
| Students Data | Full CRUD, bulk Excel upload | — |
| Study Materials | Upload, edit, hide, delete | View-only, watermarked |
| Assessments | Create, evaluate, grade | Submit answers, view marks |
| Payments | Track status, edit per student | — |
| AI Generation | Generate assessment questions via AI | — |

---

## Authentication

**Admin Sign-Up fields:** Name, Phone, Email, Institute Name, Feature checkboxes

**Login:** Email or phone + password

**Security:** Single active session, rate limiting, refresh token support

---

## Admin Features

- **Dashboard:** Stats cards (total students, pending payments, upcoming assessments, notifications)
- **Students:** Grid + search + sort + pagination + edit + soft delete + bulk Excel upload
- **Study Materials:** Card layout with three-dot menu (Edit / Delete / Hide)
- **Assessments:** Card layout; workflow: Generate → Review → Upload → Set timeline; evaluation: MCQ auto-grade + descriptive manual marking
- **Payments:** Grid with filters, status indicator, modal showing last 10 months
- **Notifications:** Send to all or specific students, unread badge system

---

## Student Features

- Login + profile management + change password
- View materials (cards, view-only, watermarked, no download)
- View assessments (locked until start time, auto-unlock)
- Submit exam answers (including image uploads)
- View marks after evaluation
- View notifications

---

## UI Design System

| Element | Value |
|---|---|
| Primary colour | Soft blue |
| Background | Light grey |
| Cards | White |
| Text | Soft dark navy |
| Success | Soft green |
| Warning | Muted orange |
| Error | Soft red |
| Typography | Inter or Poppins |
| Style | Rounded corners, soft shadows, hover effects |

---

## Development Roadmap

| Phase | Scope |
|---|---|
| 1 | Auth, multi-tenant setup, Students CRUD, feature toggles |
| 2 | Study materials, basic assessments |
| 3 | AI integration, payments |
| 4 | Notifications, attendance |
| 5 | Role hierarchy, super admin, teacher role |
