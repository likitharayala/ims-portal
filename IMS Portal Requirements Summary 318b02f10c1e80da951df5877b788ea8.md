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

Loading states:
All data-fetching operations must show skeleton loaders while loading.
No blank screens or spinners without context — skeleton loaders match the shape of the content being loaded.

Confirmation dialogs:
All destructive actions (delete student, delete material, delete assessment, delete notification) must show a confirmation dialog before proceeding.
Dialog must clearly state what will be deleted and that the action cannot be undone.

Toast notifications:
All create, update, delete, and error actions must show a toast notification with a clear success or error message.

Mobile evaluation layout:
On mobile, the evaluation interface panels stack vertically — submission viewer on top, question marks panel below.

Feature disabled mid-session:
If admin disables a feature while a student is actively on that module, the student's next API call returns 403.
The student sees a "This feature is not available" message and is redirected to their dashboard.
No data loss occurs — the feature is hidden, not deleted.

Institute name in UI:
The institute's name is displayed in the sidebar header for all logged-in users of that institute (admin and students).
This ensures each institute's portal feels personalised.

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
Password
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
Verification token expires after 24 hours.
Admin can request a new verification email from the login page if token has expired.
Admin cannot change their email address after signup in V1.

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
Pending payments (only if Payments feature is enabled) — shows both count of students with pending/overdue payments AND total amount pending
Upcoming assessments (only if Assessments feature is enabled) — shows all assessments with status published or active (no date range filter)
Unread notifications count

Dashboard stats are fetched fresh on each page load.
Phase 2: Dashboard stats are cached in Redis with 5-minute expiry.

Institute settings:
Admin can update institute name, contact email, and phone from settings.
Admin can update their own name and password from profile settings.
Admin can enable or disable features from institute settings.

Students Module:

Grid layout
Grid columns: Name, Email, Phone, Class, School, Parent Name, Parent Phone, Joined Date, Credential Status
Credential status indicator: shows whether student has changed their temporary password (must_change_password = true/false) — admin can see at a glance who hasn't logged in yet
Dropdown filters: filter by class, filter by school (separate from search bar, above the grid)
Search bar (searches: name, email, phone, roll number, class, school) — real-time as-you-type
Sorting (by: name, join date, class — ascending and descending)
Default sort: join date descending (newest first)
Pagination: 20 students per page (fixed)
Edit / Soft delete (soft delete is permanent — deleted students cannot be restored)
When a student is soft-deleted, their active sessions are immediately invalidated
Row click opens modal with full details (admin cannot see student profile photo from modal)
Confirmation dialog shown before deleting a student
Admin can export full student list as Excel (all fields, all students regardless of current filter)

Add Student:
Form with validation
Required fields: name, email, phone, class, school, fee amount (monthly fee in ₹)
Optional fields: roll number, date of birth, address, parent name, parent phone, joined date
Password is auto-generated by the system — admin does not set it manually.
Temporary password is shown once on screen after creation for admin to note and share.
Admin cannot reset a student's password directly — students must use the forgot password flow.
Admin can edit all student fields except email after creation.
Student edit is done from the student detail modal.

Bulk Upload:
Excel upload (.xlsx only)
System provides a downloadable sample Excel template with all columns pre-filled with headers and one example row.
Admin downloads the template, fills it in, and uploads.
Required columns: Name, Email, Phone, Class, School, Fee Amount
Optional columns: Roll Number, Date of Birth, Address, Parent Name, Parent Phone, Joined Date
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
Optional description (shown on card if provided)
Upload date
Three-dot menu: Edit, Delete, Hide

Materials are visible to ALL students of the institute — no class filtering.

Filtering and sorting:
Admin and students can filter materials by subject.
Admin and students can sort by upload date (newest/oldest).
Admin can search materials by book name, subject, or author (real-time as-you-type).
Students cannot search materials — filter and sort only.
Pagination: 20 materials per page.
Material edit: admin can update metadata (title, subject, author, description) AND replace the PDF file itself.

Card design:
White background
Soft shadow
Rounded corners
Hover effect

Admin view:
Admin sees all materials including hidden ones.
Hidden materials show a "Hidden" badge on the card.
Admin can unhide from the three-dot menu.
Confirmation dialog shown before deleting a material.

Students view:
View-only
No download
No edit or delete
Watermark shows student's own name

Allowed file types: PDF only.
Maximum file size: 50MB per file.
File validation: MIME type must be application/pdf. Extension and MIME type must both match.
MinIO storage path for materials: /{institute_id}/materials/{material_id}.pdf
When admin replaces a PDF, the old file is overwritten at the same path. Any pre-signed URLs issued for the old file remain valid for up to 15 minutes — this is acceptable and expected.

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
Optional instructions/description field — shown to students on the assessment card and before they start the exam
Subject-wise configuration
MCQ / Descriptive / Both
MCQ questions always have exactly 4 options (A, B, C, D). Always exactly one correct answer per MCQ question.
Marks validation (total marks must equal sum of all question marks)
Difficulty selection per question (easy / medium / hard)
Negative marking: optional toggle — admin enables and sets deduction value per wrong MCQ answer
Maximum 100 questions per assessment.
Publishing requires: at least one question AND both start_at and end_at must be set. System blocks publishing if either is missing.
Publishing with 0 questions is blocked — admin must add at least one question before publishing
Assessments are visible to ALL students of the institute — no class filtering
Admin can edit an assessment at any status (draft, published, active, closed, evaluated). If admin edits an active assessment, a warning is shown: "Students are currently taking this exam. Changes will apply immediately." Admin can still proceed.
Admin can soft-delete an assessment at any status — submissions are also hidden
Admin can duplicate an assessment — copy is created as a new draft with the same questions and settings (start/end time is NOT copied)

Can admin create assessment without AI? Yes. Manual question entry is always available. AI generation is optional.

AI generation input:
Admin provides: subject, topic, number of questions, question type (MCQ/descriptive), difficulty level.
AI generates questions which admin reviews before publishing.
Admin can edit, delete, or add questions after AI generation.
If OpenAI API fails: show error message, allow admin to continue with manual entry.
Admin can mix AI-generated and manually-written questions in the same assessment.

Workflow:
Generate → Review → Edit → Set timeline → Publish

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
If admin clicks Finalise but some descriptive questions have no marks entered, system shows a warning listing unanswered questions. Admin can dismiss the warning and finalise anyway or go back and fill them.
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

Quick total entry mode:
For upload-only or simple assessments, admin can switch to Quick Mode in the evaluation interface.
Quick Mode shows all students in a table with a single total marks input per student.
Admin can enter total marks for all students rapidly without opening each student individually.
Quick Mode and student-by-student mode can be used together — admin can use Quick Mode for some students and detailed mode for others.
If admin opens a student in detailed mode after entering total in Quick Mode, per-question fields are blank with a note: "Total entered via Quick Mode — enter per-question marks to override."

Flag for review:
Flags are saved permanently — they persist across sessions until admin removes them.

Assessment stats (after finalising):
After admin finalises evaluation, a stats summary card is shown on the assessment:
Highest score, lowest score, assessment average, total students evaluated, total absent.
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
Locked until start time (status: published — assessment card is unclickable, cursor shows not-allowed)
Student sees start datetime and end datetime (IST) on the assessment card — no live countdown timer
Auto unlock at start_at — card becomes clickable
When student opens an active assessment, they see an instructions screen first:
  - Assessment title, instructions (if set by admin), total marks, start and end datetime (IST)
  - "Start Exam" button — questions are shown only after clicking Start
MCQ options are labeled A, B, C, D
Student can freely navigate between questions and change any answer at any time before submitting
Answers auto-save every 60 seconds
Auto-submit at end_at if student has not submitted manually — an empty submission record is created even if student answered nothing
Student cannot re-open or edit after submission
View results only after admin releases results (results_released = true)

Payments:

This module is for manual fee tracking only.
There is no payment gateway or online collection.
Admin manually records and updates payment status.

Payment record auto-generation:
A monthly scheduled job (NestJS @Cron) auto-creates a pending payment record for every active student at the start of each month (1st of the month).
When a new student is added, a payment record is immediately created for the current month (full month charge regardless of join date).
Admin does not create payment records manually — they are always auto-generated.

Fee amount:
Each student has a default fee amount set by the admin at the time of student creation (required field in Add Student form).
The fee amount remains the same every month until the admin explicitly changes it.
When admin changes the fee amount for a student, the new amount applies from the next month onwards.
Previous months retain their original amount and are not affected.
Different students can have different fee amounts.

All fee amounts displayed with ₹ symbol throughout the UI.

Payment grid columns: Student Name, Class, Month, Amount (₹), Status
Grid filters: month, status, class
Dedicated Overdue tab: shows all overdue payment records across all months in one view — no month filter needed
Status indicator: green = paid, red = pending/overdue
Modal shows last 10 months of payment history for a student

When a student is soft-deleted:
If the student has any pending or overdue payment records, those records remain visible in the payments grid.
If all payment records are paid, records are hidden along with the student.
Admin can still mark visible overdue/pending records as paid after student deletion.

Payment export:
Admin can download payment records as an Excel file.
Export can be filtered by month, class, or status before downloading.
Export includes: student name, roll number, class, month, amount (₹), status, notes.
No individual PDF receipts — bulk Excel export only.

Payment record created on Jan 31 + Feb 1 scenario:
If a student is added on Jan 31, a January payment record is created immediately.
On Feb 1, the monthly cron job creates a February record as normal.
This results in 2 records created within 2 days — this is expected and correct behaviour.

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
When bulk-updating, admin can add one note that applies to all selected students.

Fee amount management:
Admin can change fee amount for an individual student from their payment record in the Payments module.
Admin can also change fee amount for all students in a class at once — select class, set new amount, applies from next month.

Notifications:

Send to everyone
Send to specific students (multi-select)
For payment reminder type: admin also has the option to send to only students with pending or overdue payments (auto-filtered)
Unread badge system (shows count of unread notifications)
Notification bell icon in the header (both admin and student views)

Students can only RECEIVE notifications, not send them.
There is no student-to-admin messaging in V1.

Notification types:
General announcement
Payment reminder — system pre-fills the message with student name, month, and amount due (₹). Admin can edit before sending.
Assessment reminder

Notifications have a title field (short, max 100 characters) and a message body (max 500 characters).
Notifications are in-app only. No email or SMS in V1.
Notifications are sent immediately — no scheduling in V1.
Notifications do not expire and remain in the list until deleted by admin.
Admin can delete a sent notification — it immediately disappears from all students' notification lists.
Students can dismiss (delete) notifications from their own list.
Dismissed notifications are removed from that student's view only — not from other students.
When a student dismisses a notification, the unread count badge decreases accordingly.
Dashboard notifications card shows count of unread notifications across all students (admin view).

---

STUDENT FEATURES

Login
First login: forced password change before accessing any feature.
Student dashboard (after login): summary cards showing upcoming assessments, unread notifications, recently added materials
Profile management (update name, phone, profile photo — cannot update email)
Change password
View materials (cards — only non-hidden materials)
View assessments (cards — status visible: locked/active/closed/evaluated)
Submit exams (only during active window)
Auto-save answers every 60 seconds during exam
Upload answer sheet files during exam (JPG, PNG, PDF — max 20MB total)
View marks per question + admin feedback (only after admin releases results)
View notifications (read/unread with badge count)
Dismiss (delete) notifications from their own list
View performance history (all past assessment marks)

Student profile photo:
Allowed formats: JPG, PNG
Maximum size: 5MB
Stored in MinIO at /{institute_id}/profiles/{student_id}.{ext} where ext is the actual file extension (jpg or png).

Student sidebar navigation:
Dashboard
Materials (only if Materials feature enabled)
Assessments (only if Assessments feature enabled)
Notifications
Profile

Admin sidebar navigation:
Dashboard
Students (only if Students feature enabled)
Materials (only if Materials feature enabled)
Assessments (only if Assessments feature enabled)
Payments (only if Payments feature enabled)
Notifications
Settings

Student dashboard cards:
Upcoming assessments (published or active)
Unread notifications count
Recently added materials (last 5 non-hidden materials)

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

Email service:
Nodemailer with Gmail SMTP is used for sending verification emails and password reset emails.
Suitable for MVP. Can be swapped for a transactional email service in later phases.

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
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM (display name + email address for outgoing emails)

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
