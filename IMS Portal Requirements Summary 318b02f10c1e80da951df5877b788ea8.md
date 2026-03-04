# IMS Portal Requirements Summary

IMS PORTAL – COMPLETE SYSTEM SUMMARY (VERSION 1 + ROADMAP)

---

1. PROJECT VISION

IMS Portal is a multi-tenant SaaS-based Institute Management System designed for tuition centres and small institutes.

The system allows each institute to register, select features, and dynamically enable only those features in their portal.

It is designed to be:

- Secure
- Scalable
- Open-source
- AI-ready
- Role-based
- Card-based modern UI
- Calm and user-friendly

---

1. CORE SYSTEM CONCEPT

The system has:

- Multi-tenant architecture
- Role-based access control
- Feature-based dynamic rendering
- Soft delete system
- Audit logging
- Single active session enforcement
- Rate limiting
- Secure file handling
- AI-powered assessments (optional in V1)

---

1. TECHNOLOGY STACK (OPEN SOURCE)

Frontend:

Next.js with TypeScript

Why:

- SEO support for landing page
- Production-ready routing
- Clean structure
- Large ecosystem
- SaaS friendly

CSS / UI:

Tailwind CSS

Why:

- Lightweight
- Highly customizable
- Perfect for calm SaaS dashboard
- Utility-first
- Easy theme control

Optional:

Shadcn UI (for accessible components)

Backend:

NestJS (Node.js framework)

Why:

- Structured architecture
- Modular
- TypeScript-first
- Scalable
- Enterprise-ready

Database:

PostgreSQL

Why:

- Strong relational model
- ACID compliant
- Ideal for payments & audit logs
- Perfect for multi-tenant structure

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

---

1. UI / DESIGN REQUIREMENTS

Theme:

- Calm
- Pastel-based
- Minimal
- Spacious
- Card-based layout

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

- Rounded corners
- Soft shadows
- Hover effects
- Minimal clutter
- Clear hierarchy
- Clean sidebar navigation

---

1. LANDING PAGE REQUIREMENTS

Header:

Top left – Portal name

Top right – Sign In and Sign Up buttons

Body:

Description of portal

Feature highlights

Call-to-action

---

1. AUTHENTICATION REQUIREMENTS

Admin Sign Up:

Fields:

- Name
- Phone number
- Email
- Institute name
- Role (Admin)
- Feature checkboxes:
    
    Students Data
    
    Study Materials
    
    Assessments
    
    Payments
    
    AI Generation
    

Dynamic requirement:

Only selected features should appear in admin sidebar and student portal.

Login:

- Email or phone
- Password

Security:

- Single active session enforcement
- Rate limiting
- Refresh token support

---

1. ADMIN FEATURES

Dashboard:

Cards showing:

- Total students
- Pending payments
- Upcoming assessments
- Notifications

Students Module:

- Grid layout
- Search bar
- Sorting
- Pagination
- Edit / Soft delete
- Row click opens modal with full details

Add Student:

Form with validation

Bulk Upload:

Excel upload

Column validation

Reject if mismatch

Study Materials:

IMPORTANT: Must appear in Card Layout

Each card:

- Book name
- Subject
- Author
- Three-dot menu:
    
    Edit
    
    Delete
    
    Hide
    

Card design:

- White background
- Soft shadow
- Rounded corners
- Hover effect

Students:

View-only

No edit/delete

No download

Watermark in viewer

Assessments:

Must appear in Card Layout

Each card:

- Title
- Subjects
- Total marks
- Start date
- End date
- Status badge

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

- Mark descriptive answers
- Select correct/incorrect for MCQ
- Auto-calculate marks
- Upload camera images

Student:

- Locked until start time
- Auto unlock
- Submit answers
- View results after evaluation

Payments:

Grid with filters

Status indicator (green/red)

Modal shows last 10 months

Edit payment status

Notifications:

Send to everyone

Send to specific students

Unread badge system

---

1. STUDENT FEATURES

Login

Profile management

Change password

View materials (cards)

View assessments (cards)

Submit exams

Upload answer images

View marks

View/send notifications

---

1. MULTI-TENANT ARCHITECTURE

Each institute has:

- Unique institute_id

Every table must include institute_id.

All queries must filter by institute_id.

This ensures data isolation between institutes.

---

1. SOFT DELETE SYSTEM

Instead of deleting rows:

Use:

is_deleted = true

deleted_at timestamp

deleted_by

Prevents data loss and supports audit tracking.

---

1. AUDIT LOG SYSTEM

Track:

- Student edits
- Payment updates
- Assessment creation
- Marks updates
- Material edits

Stored in audit_logs table.

---

1. SINGLE ACTIVE SESSION LOGIC

Add session_id to users table.

On login:

Generate new session_id.

Store in DB.

Embed in JWT.

On every request:

Compare JWT session_id with DB.

If mismatch → force logout.

Prevents multiple simultaneous logins.

---

1. LOAD CONTROL STRATEGY

Phase 1:

- Rate limiting
- Pagination
- Proper DB indexing

Phase 2:

- Add Redis caching
- Cache dashboard stats

Phase 3:

- Add NGINX load balancer
- Horizontal scaling

Free hosting (Vercel/Render):

Limited control over load balancing.

Suitable for MVP only.

---

1. SECURITY REQUIREMENTS
- HTTPS
- JWT with refresh token
- bcrypt password hashing
- Role-based middleware
- Feature-based route protection
- Rate limiting
- Input validation
- Secure file upload validation
- Soft delete enforcement
- Audit logs
- Session invalidation logic

---

1. SCALABILITY PLAN

Start:

Single backend instance

PostgreSQL

Then:

Add Redis

Add caching

Then:

Move to VPS

Add NGINX

Add multiple backend instances

---

1. VERSION ROADMAP

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

---

FINAL SYSTEM SUMMARY

IMS Portal is a secure, scalable, open-source SaaS platform for institutes that includes:

- Multi-tenant architecture
- Role-based access control
- Feature toggling
- Card-based modern UI
- AI-powered assessments
- Secure session management
- Payment tracking
- Audit logging
- Soft delete system
- Future-ready scaling

IMS PORTAL – COMPLETE SYSTEM SUMMARY (VERSION 1 + ROADMAP)

---

1. PROJECT VISION

IMS Portal is a multi-tenant SaaS-based Institute Management System designed for tuition centres and small institutes.

The system allows each institute to register, select features, and dynamically enable only those features in their portal.

It is designed to be:

- Secure
- Scalable
- Open-source
- AI-ready
- Role-based
- Card-based modern UI
- Calm and user-friendly

---

1. CORE SYSTEM CONCEPT

The system has:

- Multi-tenant architecture
- Role-based access control
- Feature-based dynamic rendering
- Soft delete system
- Audit logging
- Single active session enforcement
- Rate limiting
- Secure file handling
- AI-powered assessments (optional in V1)

---

1. TECHNOLOGY STACK (OPEN SOURCE)

Frontend:

Next.js with TypeScript

Why:

- SEO support for landing page
- Production-ready routing
- Clean structure
- Large ecosystem
- SaaS friendly

CSS / UI:

Tailwind CSS

Why:

- Lightweight
- Highly customizable
- Perfect for calm SaaS dashboard
- Utility-first
- Easy theme control

Optional:

Shadcn UI (for accessible components)

Backend:

NestJS (Node.js framework)

Why:

- Structured architecture
- Modular
- TypeScript-first
- Scalable
- Enterprise-ready

Database:

PostgreSQL

Why:

- Strong relational model
- ACID compliant
- Ideal for payments & audit logs
- Perfect for multi-tenant structure

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

---

1. UI / DESIGN REQUIREMENTS

Theme:

- Calm
- Pastel-based
- Minimal
- Spacious
- Card-based layout

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

- Rounded corners
- Soft shadows
- Hover effects
- Minimal clutter
- Clear hierarchy
- Clean sidebar navigation

---

1. LANDING PAGE REQUIREMENTS

Header:

Top left – Portal name

Top right – Sign In and Sign Up buttons

Body:

Description of portal

Feature highlights

Call-to-action

---

1. AUTHENTICATION REQUIREMENTS

Admin Sign Up:

Fields:

- Name
- Phone number
- Email
- Institute name
- Role (Admin)
- Feature checkboxes:
    
    Students Data
    
    Study Materials
    
    Assessments
    
    Payments
    
    AI Generation
    

Dynamic requirement:

Only selected features should appear in admin sidebar and student portal.

Login:

- Email or phone
- Password

Security:

- Single active session enforcement
- Rate limiting
- Refresh token support

---

1. ADMIN FEATURES

Dashboard:

Cards showing:

- Total students
- Pending payments
- Upcoming assessments
- Notifications

Students Module:

- Grid layout
- Search bar
- Sorting
- Pagination
- Edit / Soft delete
- Row click opens modal with full details

Add Student:

Form with validation

Bulk Upload:

Excel upload

Column validation

Reject if mismatch

Study Materials:

IMPORTANT: Must appear in Card Layout

Each card:

- Book name
- Subject
- Author
- Three-dot menu:
    
    Edit
    
    Delete
    
    Hide
    

Card design:

- White background
- Soft shadow
- Rounded corners
- Hover effect

Students:

View-only

No edit/delete

No download

Watermark in viewer

Assessments:

Must appear in Card Layout

Each card:

- Title
- Subjects
- Total marks
- Start date
- End date
- Status badge

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

- Mark descriptive answers
- Select correct/incorrect for MCQ
- Auto-calculate marks
- Upload camera images

Student:

- Locked until start time
- Auto unlock
- Submit answers
- View results after evaluation

Payments:

Grid with filters

Status indicator (green/red)

Modal shows last 10 months

Edit payment status

Notifications:

Send to everyone

Send to specific students

Unread badge system

---

1. STUDENT FEATURES

Login

Profile management

Change password

View materials (cards)

View assessments (cards)

Submit exams

Upload answer images

View marks

View/send notifications

---

1. MULTI-TENANT ARCHITECTURE

Each institute has:

- Unique institute_id

Every table must include institute_id.

All queries must filter by institute_id.

This ensures data isolation between institutes.

---

1. SOFT DELETE SYSTEM

Instead of deleting rows:

Use:

is_deleted = true

deleted_at timestamp

deleted_by

Prevents data loss and supports audit tracking.

---

1. AUDIT LOG SYSTEM

Track:

- Student edits
- Payment updates
- Assessment creation
- Marks updates
- Material edits

Stored in audit_logs table.

---

1. SINGLE ACTIVE SESSION LOGIC

Add session_id to users table.

On login:

Generate new session_id.

Store in DB.

Embed in JWT.

On every request:

Compare JWT session_id with DB.

If mismatch → force logout.

Prevents multiple simultaneous logins.

---

1. LOAD CONTROL STRATEGY

Phase 1:

- Rate limiting
- Pagination
- Proper DB indexing

Phase 2:

- Add Redis caching
- Cache dashboard stats

Phase 3:

- Add NGINX load balancer
- Horizontal scaling

Free hosting (Vercel/Render):

Limited control over load balancing.

Suitable for MVP only.

---

1. SECURITY REQUIREMENTS
- HTTPS
- JWT with refresh token
- bcrypt password hashing
- Role-based middleware
- Feature-based route protection
- Rate limiting
- Input validation
- Secure file upload validation
- Soft delete enforcement
- Audit logs
- Session invalidation logic

---

1. SCALABILITY PLAN

Start:

Single backend instance

PostgreSQL

Then:

Add Redis

Add caching

Then:

Move to VPS

Add NGINX

Add multiple backend instances

---

1. VERSION ROADMAP

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

---

FINAL SYSTEM SUMMARY

IMS Portal is a secure, scalable, open-source SaaS platform for institutes that includes:

- Multi-tenant architecture
- Role-based access control
- Feature toggling
- Card-based modern UI
- AI-powered assessments
- Secure session management
- Payment tracking
- Audit logging
- Soft delete system
- Future-ready scaling