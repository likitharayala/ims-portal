IMS Portal Requirements Summary

IMS PORTAL – COMPLETE SYSTEM SUMMARY (VERSION 1 + ROADMAP)

PROJECT VISION

IMS Portal is a multi-tenant SaaS-based Institute Management System designed for tuition centres and small institutes.

The system allows each institute to register, select features, and dynamically enable only those features in their portal.

It is designed to be:

Secure

Scalable

Open-source

AI-ready

Role-based

Card-based modern UI

Calm and user-friendly

CORE SYSTEM CONCEPT

The system has:

Multi-tenant architecture

Role-based access control

Feature-based dynamic rendering

Soft delete system

Audit logging

Single active session enforcement

Rate limiting

Secure file handling

AI-powered assessments (optional in V1)

Layered backend architecture (Frontend → Backend → Database)

TECHNOLOGY STACK (OPEN SOURCE)

Frontend:

Next.js with TypeScript

Why:

SEO support for landing page

Production-ready routing

Clean structure

Large ecosystem

SaaS friendly

CSS / UI:

Tailwind CSS

Why:

Lightweight

Highly customizable

Perfect for calm SaaS dashboard

Utility-first

Easy theme control

Optional:

Shadcn UI (for accessible components)

Backend:

NestJS (Node.js framework)

Why:

Structured architecture

Modular

TypeScript-first

Scalable

Enterprise-ready

Database:

PostgreSQL

Database Hosting:

Supabase PostgreSQL

Why:

Free tier hosting for PostgreSQL

Easy setup and dashboard management

Automatic backups

Suitable for MVP and early-stage scaling

Authentication:

JWT (Access + Refresh tokens)

bcrypt for password hashing

Optional (Scaling Phase):

Redis (caching + session validation)

File Storage:

Local storage (development)

MinIO (open-source S3 alternative for production)

AI Integration:

Initial – OpenAI free tier

Later – Ollama (self-hosted LLM like LLaMA)

SYSTEM ARCHITECTURE

The system follows layered architecture.

Architecture:

Frontend (Next.js UI)
↓
Backend API (NestJS)
↓
Database (Supabase PostgreSQL)

Important rule:

Frontend must never access the database directly.
All operations must go through backend APIs.

UI / DESIGN REQUIREMENTS

Theme:

Calm

Pastel-based

Minimal

Spacious

Card-based layout

Color palette:

Primary: Soft blue

Background: Light grey

Cards: White

Text: Soft dark navy

Success: Soft green

Warning: Muted orange

Error: Soft red

Typography:

Inter or Poppins

Design principles:

Rounded corners

Soft shadows

Hover effects

Minimal clutter

Clear hierarchy

Clean sidebar navigation

LANDING PAGE REQUIREMENTS

Header:

Top left – Portal name

Top right – Sign In and Sign Up buttons

Body:

Description of portal

Feature highlights

Call-to-action

AUTHENTICATION REQUIREMENTS

Admin Sign Up:

Fields:

Name

Phone number

Email

Institute name

Role (Admin)

Feature checkboxes

Students Data

Study Materials

Assessments

Payments

AI Generation

Dynamic requirement:

Only selected features should appear in admin sidebar and student portal.

Login:

Email or phone

Password

Security:

Single active session enforcement

Rate limiting

Refresh token support

ADMIN FEATURES

Dashboard:

Cards showing:

Total students

Pending payments

Upcoming assessments

Notifications

Students Module:

Grid layout

Search bar

Sorting

Pagination

Edit / Soft delete

Row click opens modal with full details

Add Student:

Form with validation

Bulk Upload:

Excel upload

Column validation

Reject if mismatch

System must provide downloadable Excel template.

Study Materials:

IMPORTANT: Must appear in Card Layout

Each card:

Book name

Subject

Author

Three-dot menu

Edit

Delete

Hide

Card design:

White background

Soft shadow

Rounded corners

Hover effect

Students:

View-only

No edit/delete

No download

Watermark in viewer

Students should be able to search words inside documents.

Document Viewer Security:

Disable download button

Disable right-click

Disable print option

Add watermark with student name

Note:

Complete screenshot prevention cannot be guaranteed in browsers.

Assessments:

Must appear in Card Layout

Each card:

Title

Subjects

Total marks

Start date

End date

Status badge

Create Assessment:

Dynamic form

Subject-wise configuration

MCQ / Descriptive / Both

Marks validation

Difficulty selection

Workflow:

Generate → Review → Upload → Set timeline

Evaluation:

Admin can:

Mark descriptive answers

Select correct/incorrect for MCQ

Auto-calculate marks

Upload camera images

Student:

Locked until start time

Auto unlock

Submit answers

View results after evaluation

Payments:

Grid with filters

Status indicator (green/red)

Modal shows last 10 months

Edit payment status

Notifications:

Send to everyone

Send to specific students

Unread badge system

STUDENT FEATURES

Login

Profile management

Change password

View materials (cards)

View assessments (cards)

Submit exams

Upload answer images

View marks

View/send notifications

MULTI-TENANT ARCHITECTURE

Each institute has:

Unique institute_id

Every table must include institute_id.

All queries must filter by institute_id.

This ensures data isolation between institutes.

SOFT DELETE SYSTEM

Instead of deleting rows:

Use:

is_deleted = true

deleted_at timestamp

deleted_by

Prevents data loss and supports audit tracking.

AUDIT LOG SYSTEM

Track:

Student edits

Payment updates

Assessment creation

Marks updates

Material edits

Stored in audit_logs table.

SINGLE ACTIVE SESSION LOGIC

Add session_id to users table.

On login:

Generate new session_id.

Store in DB.

Embed in JWT.

On every request:

Compare JWT session_id with DB.

If mismatch → force logout.

Prevents multiple simultaneous logins.

LOAD CONTROL STRATEGY

Phase 1:

Rate limiting

Pagination

Proper DB indexing

Phase 2:

Add Redis caching

Cache dashboard stats

Phase 3:

Add NGINX load balancer

Horizontal scaling

Free hosting (Vercel/Render):

Limited control over load balancing.

Suitable for MVP only.

DATABASE PERFORMANCE REQUIREMENTS

Indexes must be created for frequently queried fields.

Examples:

institute_id

student_id

email

created_at

This ensures fast queries as data grows.

SECURITY REQUIREMENTS

HTTPS

JWT with refresh token

bcrypt password hashing

Role-based middleware

Feature-based route protection

Rate limiting

Input validation

Secure file upload validation

Soft delete enforcement

Audit logs

Session invalidation logic

ENVIRONMENT CONFIGURATION

The system must support two environments.

Development Environment:

Local backend server

Local file storage

Local development database

Production Environment:

Supabase PostgreSQL

MinIO storage

VPS deployment (future phase)

Environment variables must store:

Database URL

JWT secret

Storage configuration

AI API keys

SCALABILITY PLAN

Start:

Single backend instance

Supabase PostgreSQL

Then:

Add Redis

Add caching

Then:

Move to VPS

Add NGINX

Add multiple backend instances

VERSION ROADMAP

Phase 1:

Authentication

Multi-tenant setup

Students CRUD

Feature toggles

Phase 2:

Study materials

Assessments basic

Phase 3:

AI integration

Payments

Phase 4:

Notifications

Attendance

Phase 5:

Role hierarchy

Super admin

Teacher role

FINAL SYSTEM SUMMARY

IMS Portal is a secure, scalable, open-source SaaS platform for institutes that includes:

Multi-tenant architecture

Role-based access control

Feature toggling

Card-based modern UI

AI-powered assessments

Secure session management

Payment tracking

Audit logging

Soft delete system

Supabase PostgreSQL database hosting

Future-ready scaling