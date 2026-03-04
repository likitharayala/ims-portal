IMS Portal Requirements Summary

IMS PORTAL – COMPLETE SYSTEM SUMMARY (VERSION 1 + ROADMAP)

---

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

---

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

---

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

File URL security:
All file URLs are pre-signed and time-limited (15 minutes expiry).
No permanent public URLs for any uploaded file.

AI Integration:
Initial – OpenAI free tier
Later – Ollama (self-hosted LLM like LLaMA)

---

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

---

TIMEZONE

All timestamps are stored in UTC in the database.
All dates and times are displayed in Indian Standard Time (IST, UTC+5:30) in the UI.
Assessment start and end times are set by admin in IST and stored as UTC.
Students see all times in IST regardless of their device timezone.

---

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

Mobile responsiveness:
The system must be fully responsive and usable on mobile and tablet devices.
All dashboards, grids, and card layouts must adapt to smaller screens.
The document viewer must work on mobile browsers.

Empty states:
Every module must show a meaningful empty state when no data exists.
Empty states include an illustration or icon, a short message, and a call-to-action button where applicable.
Example: Students module with no students shows "No students added yet" with an "Add Student" button.

---

LANDING PAGE REQUIREMENTS

Header:
Top left – Portal name
Top right – Sign In and Sign Up buttons

Body:
Description of portal
Feature highlights
Call-to-action

---

AUTHENTICATION REQUIREMENTS

Admin Sign Up:

Fields:
Name
Phone number
Email
Institute name
Role (Admin)
Feature checkboxes:
  Students Data
  Study Materials
  Assessments
  Payments
  AI Generation

Validation:
Email must be unique globally across all institutes.
Phone must be valid format.
Institute name must be unique.
Password minimum 8 characters.

Email verification:
After sign-up, admin receives a verification email.
Admin must verify email before accessing the dashboard.
Unverified accounts cannot log in.

Dynamic requirement:
Only selected features should appear in admin sidebar and student portal.

Feature toggle after signup:
Admin can enable or disable features from institute settings at any time.
When a feature is disabled, its data is hidden from the UI but NOT deleted from the database.
Re-enabling the feature restores all previously hidden data.
Example: Disabling Assessments hides all assessments and submissions. Re-enabling restores them.

Login:
Email or phone
Password

Forgot Password:
Admin and students can request a password reset via email.
System sends a reset link to the registered email.
Reset link expires after 30 minutes.
After reset, all active sessions are invalidated.
Student forgot password: student enters their registered email. If email exists, reset link is sent.

Security:
Single active session enforcement
Rate limiting
Refresh token support

Multiple admins per institute:
Phase 1: Only one admin per institute.
Phase 5: Multiple admin accounts per institute with role hierarchy.

---

STUDENT ACCOUNT CREATION

Students do not self-register. All student accounts are created by the admin.

How students receive credentials:
When admin adds a student (individually or via bulk upload), the system auto-generates a temporary password.
The admin can view and share the temporary password with the student manually (shown once on screen after creation).
Student must change their password on first login.
First login prompt: "Please set a new password to continue."

Bulk upload credential handling:
After successful bulk upload, admin can download a CSV of all newly created student emails and temporary passwords.
This CSV is generated once and not stored. Admin is responsible for distribution.

---

ADMIN FEATURES

Dashboard:

Cards showing:
Total students
Pending payments (only if Payments feature is enabled)
Upcoming assessments (only if Assessments feature is enabled)
Unread notifications count

Dashboard stats are fetched fresh on each page load.
Phase 2: Dashboard stats are cached in Redis with 5-minute expiry.

Institute settings:
Admin can update institute name, contact email, and phone from settings.
Admin can update their own name and password from profile settings.
Admin can enable or disable features from institute settings.

Students Module:

Grid layout
Search bar (searches: name, email, phone, roll number)
Sorting (by: name, join date, batch — ascending and descending)
Default sort: join date descending (newest first)
Pagination: 20 students per page (fixed)
Edit / Soft delete
Row click opens modal with full details

Add Student:
Form with validation
Required fields: name, email, phone, class, school
Optional fields: roll number, date of birth, address, parent name, parent phone, batch, joined date
Password is auto-generated by the system — admin does not set it manually.

Bulk Upload:
Excel upload (.xlsx only)
System provides a downloadable sample Excel template with all columns pre-filled with headers and one example row.
Admin downloads the template, fills it in, and uploads.
Required columns: Name, Email, Phone, Class, School
Optional columns: Roll Number, Date of Birth, Address, Parent Name, Parent Phone, Batch, Joined Date
Optional columns can be left blank.
Column validation: reject entire file if required columns are missing or renamed.
Row validation: skip rows with duplicate emails and report them to admin after upload.
After upload: admin sees a summary — X students created, Y rows skipped (with reasons).
After upload: admin can download a one-time CSV of new student credentials (email + temporary password).

Study Materials:

IMPORTANT: Must appear in Card Layout.

Each card shows:
Book name
Subject
Author
Three-dot menu: Edit, Delete, Hide

Card design:
White background
Soft shadow
Rounded corners
Hover effect

Admin view:
Admin sees all materials including hidden ones.
Hidden materials show a "Hidden" badge on the card.
Admin can unhide from the three-dot menu.

Students view:
View-only
No download
No edit or delete
Watermark shows student's own name

Allowed file types: PDF only.
Maximum file size: 50MB per file.
File validation: MIME type must be application/pdf. Extension and MIME type must both match.

Document Viewer Security:
Disable download button
Disable right-click on the viewer
Disable print option (CSS @media print + beforeprint event)
Add watermark with student's own name overlaid across the document
Students can search words inside documents (PDF.js built-in text search — works for text-based PDFs only)

Important note on document viewer:
In-document search works only for text-based PDFs.
Scanned or image-based PDFs cannot be searched.
This is a browser limitation and will be communicated to users.
Complete screenshot prevention cannot be guaranteed in browsers.

Mid-session hide behaviour:
If admin hides a material while a student is actively viewing it, the document remains accessible for the current session.
On next open, the document will be hidden.

Assessments:

Must appear in Card Layout.

Each card shows:
Title
Subjects
Total marks
Start date and time (IST)
End date and time (IST)
Status badge

Assessment status workflow:
draft – created but not visible to students
published – visible to students but locked (before start time)
active – auto-transitions at start_at time (students can submit)
closed – auto-transitions at end_at time (no more submissions)
evaluated – admin has completed evaluation

Status transitions:
draft → published: manual by admin
published → active: automatic at start_at (system job)
active → closed: automatic at end_at (system job)
closed → evaluated: manual by admin after evaluation is complete

Create Assessment:
Dynamic form
Subject-wise configuration
MCQ / Descriptive / Both
Marks validation (total marks must equal sum of all question marks)
Difficulty selection per question (easy / medium / hard)

Can admin create assessment without AI? Yes. Manual question entry is always available. AI generation is optional.

AI generation input:
Admin provides: subject, topic, number of questions, question type (MCQ/descriptive), difficulty level.
AI generates questions which admin reviews before publishing.
Admin can edit, delete, or add questions after AI generation.
If OpenAI API fails: show error message, allow admin to continue with manual entry.
Admin can mix AI-generated and manually-written questions in the same assessment.

Workflow:
Generate → Review → Upload → Set timeline → Publish

Student Submission Modes:

Every assessment supports both modes simultaneously. Students can use one or both.

Mode 1 — Online (typing):
Student sees all questions during the exam.
For MCQ questions: selectable options are displayed.
For Descriptive questions: text input fields are provided for typing answers.
Answers auto-save every 60 seconds.
Student submits manually or system auto-submits at end_at.

Mode 2 — Written exam upload:
Student sees all questions during the exam (questions always visible regardless of mode).
Student writes answers on paper and uploads images or a PDF of the answer sheet.
Upload must be completed before end_at.
Allowed file types: JPG, PNG, PDF.
Maximum total upload size: 20MB.
Student can upload multiple files (images + PDF combined, total ≤ 20MB).

Both modes at once:
Student can type answers for some questions AND upload a file for the full answer sheet.
Admin sees both typed answers and uploaded files in the evaluation view.

Evaluation:

Navigation:
Admin evaluates student by student.
Admin opens one student's submission, scores all their answers, then moves to the next student.

Evaluation interface per student:
Admin sees the student's typed answers (MCQ selections + descriptive text) and uploaded files displayed inline side by side.
Uploaded images and PDFs are shown directly in the interface — no download needed.
Admin assigns marks per descriptive answer.
Admin can add optional feedback/comments per answer.
MCQ answers are auto-evaluated against correct_option — admin sees the result but cannot override individual MCQ marks.

Mixed submission (typed + uploaded):
If a student both typed an answer and uploaded a file for the same question, both are shown side by side.
Admin enters one set of marks — they decide which submission to base marks on.

Upload-only students:
If a student only uploaded a file (no typed answers), admin can choose to:
Enter marks per question individually (reading the uploaded sheet).
Or enter a single total marks number for the entire paper.
Both options are available and admin decides per evaluation.

Progress tracking:
A progress bar and count at the top of the evaluation page shows how many students have been evaluated (e.g. "12/30 evaluated").
Each student in the student list shows a status badge: Evaluated or Pending.

Save behaviour:
Marks auto-save as admin enters them. Admin can close and resume at any time without losing progress.
Admin clicks "Finalise Evaluation" at the end to confirm all marks are complete and trigger total_marks_awarded calculation.
After finalising, admin can still re-evaluate and update marks before releasing results.

MCQ evaluation:
Typed MCQ answers (student clicked an option in the portal) are auto-evaluated against correct_option when the assessment closes. Admin sees the result as read-only — no action needed.
Uploaded MCQ answers (student circled an answer on paper) cannot be auto-evaluated. Admin manually marks each MCQ using a correct (✓) / incorrect (✗) toggle in the evaluation interface. System calculates marks automatically from the toggle.
If negative marking is enabled, toggling ✗ automatically applies the configured deduction.
Admin never manually types marks for MCQ questions — only toggles correct/incorrect for uploaded submissions.

Evaluation interface layout:
Left panel: question list with marks entry per question.
  - Descriptive questions: editable marks input field (e.g. __ / 10) + optional comment field. The comment field is hidden by default and expands on click to keep the interface clean.
  - MCQ questions (typed): auto-filled, read-only, shows correct/incorrect result.
  - MCQ questions (uploaded): ✓ / ✗ toggle — admin clicks after reading the uploaded sheet.
  - Running total updates live at the bottom as marks are entered — admin always sees the current total without needing to do anything.
  - When admin clicks Finalise Evaluation, the system automatically calculates and stores the final total_marks_awarded for that student (sum of all question marks including MCQ auto-marks and toggled marks).
  - If admin edits any marks after finalising, total_marks_awarded is automatically recalculated immediately — no need to click Finalise again.
  - Finalise button at the bottom of the left panel.
Right panel: student submission viewer.
  - Typed answers: shows typed text or MCQ selection directly.
  - Uploaded files: shows images and PDF inline (scrollable viewer).
  - Mixed: shows typed answers first, uploaded files below.
Admin reads the right panel and assigns marks on the left panel. Same layout for all submission types.

Negative marking:
Admin decides per assessment whether negative marking applies.
When creating an assessment, admin can enable negative marking and set the deduction value per wrong MCQ answer.
If negative marking is disabled: wrong MCQ answer = 0 marks.
Unattempted MCQ questions always = 0 marks regardless of negative marking setting.
Total marks awarded are capped at 0 — they can never go negative even if deductions exceed correct marks.

Unattempted questions:
If a student skips a question, admin sees a "Not attempted" label in the evaluation view.
The marks field for that question starts empty — admin must manually enter 0 if desired.
System does not auto-assign 0 for skipped questions.

Absent students (never submitted):
If a student never opened or submitted the assessment, they appear in the evaluation list with an "Absent" badge.
Their marks are automatically set to 0. No evaluation action required from admin.
Absent students are included when results are released — they see their score as 0.

Results release:
Admin can release results for individual students or release all at once.
Individual release: admin selects a student and clicks "Release Results" for that student only.
Bulk release: admin clicks "Release All" to release results for every student at once.
Once released, marks remain editable. Admin can update marks at any time even after release.
When admin updates marks after release, students see the updated marks immediately.
There is no lock after release — admin always retains full control over marks.

Marks editing after evaluation:
Admin can re-evaluate and update marks before results are released to students.
Once admin marks results as "released", students can view their marks.
Add a results_released boolean field to assessments.

Quick total entry mode:
For upload-only or simple assessments, admin can switch to Quick Mode in the evaluation interface.
Quick Mode shows all students in a table with a single total marks input per student.
Admin can enter total marks for all students rapidly without opening each student individually.
Quick Mode and student-by-student mode can be used together — admin can use Quick Mode for some students and detailed mode for others.

Assessment stats (after finalising):
After admin finalises evaluation, a stats summary card is shown on the assessment:
Highest score, lowest score, class average, total students evaluated, total absent.
Stats update automatically if admin edits marks after finalising.

Flag for review:
During evaluation, admin can flag a specific student's answer with a "Flag for Review" marker.
Flagged answers are highlighted in the evaluation list so admin can return to them later.
Admin can unflag once resolved.
Flags are internal only — students never see them.

Student result view (after results released):
Student sees a per-question marks breakdown (e.g. Q1: 8/10, Q2: 5/10).
Student also sees any feedback/comments admin added per answer during evaluation.
Student sees their total marks and the assessment total marks.

Student performance history:
Admin can view a student's marks across all assessments from the student's profile page.
Shows a list of all assessments the student was part of: assessment name, total marks, marks awarded, date.
Displayed in reverse chronological order (most recent first).
This is a read-only view — no editing from this screen.

Student during assessment:
Locked until start time (status: published — student sees card but cannot open)
Auto unlock at start_at
Answers auto-save every 60 seconds
Auto-submit at end_at if student has not submitted manually
Student cannot re-open or edit after submission
View results only after admin releases results (results_released = true)

Payments:

This module is for manual fee tracking only.
There is no payment gateway or online collection.
Admin manually records and updates payment status.

Fee amount:
Each student has a default fee amount set by the admin at the time of student creation.
The fee amount remains the same every month until the admin explicitly changes it.
When admin changes the fee amount for a student, the new amount applies from the next month onwards.
Previous months retain their original amount and are not affected.
Different students can have different fee amounts.

Grid with filters (filter by: month, status, batch)
Status indicator: green = paid, red = pending/overdue
Modal shows last 10 months of payment history for a student

Payment statuses:
pending – created but not yet paid
paid – admin marked as paid
overdue – automatically set by the system; admin can also manually mark as overdue

Auto-overdue rule:
A daily scheduled job (NestJS @Cron) runs once per day.
Any payment with status pending where the payment month has passed by more than 5 days is automatically transitioned to overdue.
Example: January payment → overdue on February 6th if still pending.
The transition is written to audit_logs.
Admin can still manually change overdue → paid or overdue → pending at any time.

Critical rules for the cron job:
The cron job ONLY transitions pending → overdue. It never touches paid or overdue records.
A payment that is already overdue stays overdue indefinitely — there is no auto-reset or auto-forgiveness.
If a student has not paid for 5 or 6 months, all those months remain overdue until the admin explicitly marks each one as paid.
The system will never automatically mark any payment as paid. Only the admin can do that.
Overdue is a sticky status — it will not change on its own once set.

Edit payment status:
Admin can change status between pending, paid, overdue.
Admin can add optional notes when updating status.
Admin can bulk-update payment status for multiple students at once (e.g. mark all as paid for a given month).

Notifications:

Send to everyone
Send to specific students (multi-select)
Unread badge system (shows count of unread notifications)

Students can only RECEIVE notifications, not send them.
There is no student-to-admin messaging in V1.

Notification types:
General announcement
Payment reminder
Assessment reminder

Notifications are in-app only. No email or SMS in V1.
Notifications do not expire and remain in the list until deleted by admin.
Dashboard notifications card shows count of unread notifications across all students (admin view).

---

STUDENT FEATURES

Login
First login: forced password change before accessing any feature.
Profile management (update name, phone, profile photo)
Change password
View materials (cards — only non-hidden materials)
View assessments (cards — status visible: locked/active/closed/evaluated)
Submit exams (only during active window)
Auto-save answers every 60 seconds during exam
Upload answer images (JPG/PNG, max 10MB each, max 3 per question)
View marks (only after admin releases results)
View notifications (read/unread with badge count)

Student profile photo:
Allowed formats: JPG, PNG
Maximum size: 5MB
Stored in MinIO at /{institute_id}/profiles/{student_id}.jpg

---

MULTI-TENANT ARCHITECTURE

Each institute has:
Unique institute_id

Every table must include institute_id.
All queries must filter by institute_id.
This ensures data isolation between institutes.

institute_id is always extracted from the JWT token.
institute_id from request body is always ignored.

---

SOFT DELETE SYSTEM

Instead of deleting rows, use:
is_deleted = true
deleted_at timestamp
deleted_by (user ID)

Prevents data loss and supports audit tracking.
Soft-deleted records are never shown in the UI.
Soft-deleted records are excluded from all queries by default.

---

AUDIT LOG SYSTEM

Track all mutations:
Student edits
Payment updates
Assessment creation and edits
Marks updates
Material edits
Login and logout events
Bulk upload actions
Feature toggle changes

Stored in audit_logs table.
Audit logs are append-only. Never updated or deleted.

---

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

---

LOAD CONTROL STRATEGY

Phase 1:
Rate limiting
Pagination (20 items per page default)
Proper DB indexing

Phase 2:
Add Redis caching
Cache dashboard stats (5-minute TTL)
Cache institute feature flags

Phase 3:
Add NGINX load balancer
Horizontal scaling

Free hosting (Vercel/Render):
Limited control over load balancing.
Suitable for MVP only.

---

DATABASE PERFORMANCE REQUIREMENTS

Indexes must be created for frequently queried fields:
institute_id
student_id
email
created_at
status fields (payment status, assessment status, submission status)

Composite indexes on (institute_id, is_deleted) for all major tables.
Partial indexes excluding is_deleted = true rows.
Full-text search GIN indexes on student name/email and material title/subject.

---

SECURITY REQUIREMENTS

HTTPS
JWT with refresh token
bcrypt password hashing (rounds = 12)
Role-based middleware
Feature-based route protection
Rate limiting:
  /auth/login → 5 requests per 15 minutes per IP
  /auth/signup → 3 requests per hour per IP
  /auth/refresh → 10 requests per 15 minutes per IP
  All other routes → 100 requests per minute per IP
Input validation (max lengths enforced, no raw SQL, sanitised inputs)
Secure file upload validation:
  MIME type check
  File extension whitelist
  Max file size enforcement
Soft delete enforcement
Audit logs
Session invalidation logic
CORS: only allow requests from the registered frontend domain
Pre-signed time-limited URLs for all MinIO file access (15-minute expiry)

---

ENVIRONMENT CONFIGURATION

The system must support two environments.

Development Environment:
Local backend server
Local file storage (./uploads directory)
Local PostgreSQL database

Production Environment:
Supabase PostgreSQL
MinIO storage
VPS deployment (future phase)

Environment variables must store:
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
STORAGE_TYPE (local or minio)
MINIO_ENDPOINT
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET_NAME
OPENAI_API_KEY
FRONTEND_URL (for CORS and email links)
APP_ENV (development or production)

All environment variables must be defined in a .env.example file in the repository.
Actual .env files must never be committed to Git.

---

SCALABILITY PLAN

Start:
Single backend instance
Supabase PostgreSQL
Rate limiting + pagination + DB indexing

Then:
Add Redis
Add caching (dashboard stats, feature flags)

Then:
Move to VPS
Add NGINX reverse proxy
Add multiple backend instances

---

VERSION ROADMAP

Phase 1:
Authentication (login, signup, email verification, forgot password)
Multi-tenant setup
Students CRUD + bulk upload with credential export
Feature toggles
Institute and admin profile settings

Phase 2:
Study materials with secure document viewer
Basic assessments (create, publish, submit, evaluate)

Phase 3:
AI assessment generation
Payments module

Phase 4:
Notifications
Attendance

Phase 5:
Role hierarchy
Super admin
Teacher role
Multiple admins per institute

---

FINAL SYSTEM SUMMARY

IMS Portal is a secure, scalable, open-source SaaS platform for institutes that includes:

Multi-tenant architecture
Role-based access control
Feature toggling
Card-based modern UI
AI-powered assessments
Secure session management
Payment tracking (manual, no gateway)
Audit logging
Soft delete system
Supabase PostgreSQL database hosting
Pre-signed time-limited file URLs
Mobile-responsive design
IST timezone display
Future-ready scaling
