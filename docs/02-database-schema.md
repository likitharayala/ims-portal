# Teachly — Database Schema (Section 2)

**Hosted on:** Supabase PostgreSQL (dev: local PostgreSQL)
**Accessed by:** NestJS backend only — frontend never connects directly

Non-negotiable rules applied to every table:
- `institute_id` on every table except static lookups (`roles`, `features`)
- Soft delete: `is_deleted` + `deleted_at` + `deleted_by` on every mutable table
- UUID primary keys throughout — no sequential integer IDs exposed
- All timestamps use `TIMESTAMPTZ` (UTC) — never plain `TIMESTAMP`
- Audit trail: all mutations write to `audit_logs`
- Indexes on `institute_id`, `student_id`, `email`, `created_at` per requirements

---

## Table Definitions

---

### Table: `institutes`

Root tenant record. Every other record traces back here.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| name | VARCHAR(255) | NOT NULL | Institute display name |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Contact / login email |
| phone | VARCHAR(20) | NOT NULL | Contact phone |
| slug | VARCHAR(100) | NOT NULL, UNIQUE | URL-safe identifier e.g. `sunrise-academy` |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Account enabled status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE UNIQUE INDEX idx_institutes_email ON institutes(email);
CREATE UNIQUE INDEX idx_institutes_slug  ON institutes(slug);
```

**Notes:** No soft delete on institutes — deactivated via `is_active = false`. Supabase auto-manages `created_at` via Row Level Security if needed.

**`is_active` behaviour in the guard pipeline:**
Setting `is_active = false` on the `institutes` row does **not** automatically block logins — the `JwtAuthGuard` queries `users`, not `institutes`. To block all users of a deactivated institute, set `users.is_active = false` for every associated user row. `institutes.is_active` is a platform-level marker used by the super-admin (Phase 5) and for billing logic; it is not checked in the auth guard chain in V1.

**`slug` field:**
Reserved for future subdomain routing (`sunrise-academy.imsportal.com`). Not used in any route or guard in V1. Stored now to reserve the unique identifier early and prevent name-squatting as institutes onboard.

---

### Table: `roles`

Static lookup. Seeded once at deployment, never modified at runtime.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SMALLINT | PK | 1=admin, 2=student, 3=teacher (Phase 5), 4=super_admin (Phase 5) |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Role identifier |
| description | TEXT | | Human-readable description |

**Seed data:**
```sql
INSERT INTO roles (id, name, description) VALUES
  (1, 'admin',       'Institute administrator with full access'),
  (2, 'student',     'Student with read and submit access');
```

---

### Table: `features`

Static lookup of all available feature toggles. Seeded once at deployment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SMALLINT | PK | Stable numeric ID |
| key | VARCHAR(50) | NOT NULL, UNIQUE | Machine key used in guards and JWT |
| label | VARCHAR(100) | NOT NULL | Display name shown on signup |
| description | TEXT | | What enabling this feature unlocks |

**Seed data:**
```sql
INSERT INTO features (id, key, label) VALUES
  (1, 'students',      'Students Data'),
  (2, 'materials',     'Study Materials'),
  (3, 'assessments',   'Assessments'),
  (4, 'payments',      'Payments'),
  (5, 'ai_generation', 'AI Generation');
```

---

### Table: `institute_features`

Junction table — which features are enabled for each institute.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id ON DELETE CASCADE | Tenant |
| feature_id | SMALLINT | NOT NULL, FK → features.id | Feature |
| enabled_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | When enabled |
| enabled_by | UUID | FK → users.id | Admin who toggled it |

**Constraints:**
```sql
UNIQUE (institute_id, feature_id)
```

**Indexes:**
```sql
CREATE INDEX idx_inst_features_institute ON institute_features(institute_id);
```

---

### Table: `users`

All authenticated users — admins and students share this table, differentiated by `role_id`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| role_id | SMALLINT | NOT NULL, FK → roles.id | 1=admin, 2=student |
| name | VARCHAR(255) | NOT NULL | Full name |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Login email — globally unique across all institutes |
| phone | VARCHAR(20) | | Login phone (alternative identifier) |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash (rounds=12) |
| session_id | UUID | | Current active session — single-session enforcement |
| refresh_token_hash | VARCHAR(255) | | Hash of current refresh token |
| is_email_verified | BOOLEAN | NOT NULL, DEFAULT false | Admin only — must verify before dashboard access |
| email_verification_token | VARCHAR(255) | | Hashed token for email verification link |
| email_verification_expires_at | TIMESTAMPTZ | | Token expiry (24h from issue) |
| password_reset_token | VARCHAR(255) | | Hashed token for password reset link |
| password_reset_expires_at | TIMESTAMPTZ | | Token expiry (30min from issue) |
| must_change_password | BOOLEAN | NOT NULL, DEFAULT false | true for new students — forced change on first login |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Account enabled |
| last_login_at | TIMESTAMPTZ | | Last successful login timestamp |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft delete flag |
| deleted_at | TIMESTAMPTZ | | When soft-deleted |
| deleted_by | UUID | FK → users.id | Admin who deleted |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (email)                 -- email globally unique across all institutes and all roles
UNIQUE (institute_id, phone)   -- phone unique per institute
```

**Indexes:**
```sql
CREATE UNIQUE INDEX idx_users_email     ON users(email);
CREATE INDEX idx_users_institute        ON users(institute_id, is_deleted);
CREATE INDEX idx_users_phone            ON users(institute_id, phone)   WHERE is_deleted = false;
CREATE INDEX idx_users_role             ON users(institute_id, role_id) WHERE is_deleted = false;
CREATE INDEX idx_users_created_at       ON users(institute_id, created_at DESC);
```

**Notes:** `session_id` is overwritten on every login, immediately invalidating all other active sessions. Admin email cannot be changed after signup in V1.

---

### Table: `students`

Extended profile for student users. One-to-one with `users` where `role_id = 2`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| user_id | UUID | NOT NULL, UNIQUE, FK → users.id | Linked auth account |
| roll_number | VARCHAR(50) | | Institute-assigned roll number |
| class | VARCHAR(100) | NOT NULL | Class or grade e.g. "Grade 10", "Class 12A" |
| school | VARCHAR(255) | NOT NULL | School or institution the student attends |
| fee_amount | NUMERIC(10,2) | NOT NULL, CHECK (fee_amount >= 0) | Monthly fee in ₹ — set at creation, stays until admin changes. 0 is valid for scholarship/free students. |
| date_of_birth | DATE | | |
| address | TEXT | | |
| parent_name | VARCHAR(255) | | |
| parent_phone | VARCHAR(20) | | |
| join_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | |
| profile_image_url | TEXT | | MinIO path: /{institute_id}/profiles/{student_id}.{ext} |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (institute_id, roll_number) WHERE roll_number IS NOT NULL AND is_deleted = false
```

**Indexes:**
```sql
CREATE INDEX idx_students_institute  ON students(institute_id, is_deleted);
CREATE INDEX idx_students_user_id    ON students(user_id);
CREATE INDEX idx_students_class      ON students(institute_id, class)    WHERE is_deleted = false;
CREATE INDEX idx_students_school     ON students(institute_id, school)   WHERE is_deleted = false;
CREATE INDEX idx_students_created_at ON students(institute_id, created_at DESC);

-- Full-text search for the student search bar
-- Covers name + email + phone (on users table)
CREATE INDEX idx_students_search ON users
  USING GIN (
    to_tsvector('english',
      name || ' ' ||
      COALESCE(email, '') || ' ' ||
      COALESCE(phone, '')
    )
  )
  WHERE is_deleted = false;

-- Class and school are filtered via B-tree indexes (idx_students_class, idx_students_school)
-- The student search query JOINs users + students and applies GIN for text + B-tree for class/school
```

---

### Table: `study_materials`

Each row is one material card. Supports the secure document viewer with in-document search.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| title | VARCHAR(255) | NOT NULL | Book / material title (shown on card) |
| subject | VARCHAR(100) | NOT NULL | Subject label (shown on card) |
| author | VARCHAR(255) | | Author name (shown on card) |
| description | TEXT | | Optional short description |
| file_url | TEXT | NOT NULL | MinIO path: /{institute_id}/materials/{uuid}.pdf |
| file_name | VARCHAR(255) | NOT NULL | Original filename |
| file_type | VARCHAR(20) | NOT NULL, CHECK (file_type = 'pdf') | Always 'pdf' — only PDF uploads allowed |
| file_size_bytes | BIGINT | | File size for display |
| is_hidden | BOOLEAN | NOT NULL, DEFAULT false | Admin hid from students (not deleted) |
| uploaded_by | UUID | NOT NULL, FK → users.id | Admin who uploaded |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_materials_institute ON study_materials(institute_id, is_deleted, is_hidden);
CREATE INDEX idx_materials_subject   ON study_materials(institute_id, subject) WHERE is_deleted = false;
CREATE INDEX idx_materials_created   ON study_materials(institute_id, created_at DESC);

-- Full-text search on title + subject + author for material search bar
CREATE INDEX idx_materials_search ON study_materials
  USING GIN (
    to_tsvector('english',
      title || ' ' ||
      subject || ' ' ||
      COALESCE(author, '')
    )
  )
  WHERE is_deleted = false;
```

**Notes:**
- `is_hidden = true`: admin hid from students but record is intact — admin can still see and unhide
- `is_deleted = true`: soft-deleted — neither admin nor student can see it
- In-document word search is handled by the frontend PDF viewer (e.g. PDF.js) — no backend change needed for this feature
- Watermark shows the logged-in student's `users.name` — injected by the viewer component at render time

---

### Table: `assessments`

Each row is one assessment card. Supports MCQ, Descriptive, or Mixed types.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| title | VARCHAR(255) | NOT NULL | Assessment title (shown on card) |
| subjects | TEXT[] | NOT NULL | Array of subjects e.g. ['Maths', 'Physics'] |
| type | VARCHAR(20) | NOT NULL, CHECK (type IN ('mcq', 'descriptive', 'mixed')) | mcq / descriptive / mixed |
| total_marks | INTEGER | NOT NULL | Sum of all question marks — kept live by service on every question add/update/delete |
| start_at | TIMESTAMPTZ | | Students can begin from this time — nullable, set before publishing |
| end_at | TIMESTAMPTZ | | Deadline — nullable, set before publishing |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft', CHECK (status IN ('draft', 'published', 'active', 'closed', 'evaluated')) | draft → published → active → closed → evaluated |
| ai_generated | BOOLEAN | NOT NULL, DEFAULT false | Questions were AI-generated |
| instructions | TEXT | | Instructions shown to student before starting |
| negative_marking_enabled | BOOLEAN | NOT NULL, DEFAULT false | Whether wrong MCQ answers deduct marks |
| negative_marking_value | NUMERIC(5,2) | NOT NULL, DEFAULT 0, CHECK (negative_marking_value >= 0) | Marks deducted per wrong MCQ answer — must be positive; sign is applied by service |
| results_released | BOOLEAN | NOT NULL, DEFAULT false | When true, students can see their marks |
| created_by | UUID | NOT NULL, FK → users.id | Admin who created |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
-- Prevent end_at being set before start_at at DB level
ALTER TABLE assessments
  ADD CONSTRAINT chk_assessments_timing
    CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at);
```

**Application-level constraints (enforced in service, not DB):**
- Publishing is blocked unless: `start_at IS NOT NULL AND end_at IS NOT NULL AND question_count >= 1`
- At publish time the service also validates: `SUM(marks) FROM assessment_questions = assessments.total_marks`

**`total_marks` update strategy:**
`total_marks` is kept live by the `AssessmentsService` on every question mutation — both operations (question change + `total_marks` update) run in the same DB transaction:
- `addQuestion` → `total_marks += question.marks`
- `updateQuestion` (marks changed) → `total_marks = total_marks - old_marks + new_marks`
- `deleteQuestion` (draft only) → `total_marks -= question.marks`

**Indexes:**
```sql
CREATE INDEX idx_assessments_institute ON assessments(institute_id, is_deleted);
CREATE INDEX idx_assessments_status    ON assessments(institute_id, status)           WHERE is_deleted = false;
CREATE INDEX idx_assessments_timing    ON assessments(institute_id, start_at, end_at) WHERE is_deleted = false AND start_at IS NOT NULL;
CREATE INDEX idx_assessments_created   ON assessments(institute_id, created_at DESC);
```

---

### Table: `assessment_questions`

Individual questions belonging to an assessment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| assessment_id | UUID | NOT NULL, FK → assessments.id ON DELETE CASCADE | Parent assessment |
| question_text | TEXT | NOT NULL | The question body |
| type | VARCHAR(20) | NOT NULL, CHECK (type IN ('mcq', 'descriptive')) | mcq / descriptive |
| marks | INTEGER | NOT NULL, CHECK (marks > 0) | Marks allocated |
| difficulty | VARCHAR(10) | NOT NULL, CHECK (difficulty IN ('easy', 'medium', 'hard')) | easy / medium / hard |
| options | JSONB | | MCQ only: exactly 4 options — `[{"label": "A", "text": "..."}, {"label": "B", ...}, {"label": "C", ...}, {"label": "D", ...}]`. No `is_correct` field — use `correct_option` column instead. |
| correct_option | VARCHAR(5) | | MCQ only: correct label e.g. `"A"`. Single source of truth for the correct answer. `is_correct` is derived at query time: `option.label === correct_option`. |
| order_index | SMALLINT | NOT NULL, DEFAULT 0 | Display order within assessment |
| image_url | TEXT | | Optional question image — MinIO path: `/{institute_id}/questions/{question_id}.{ext}` |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_questions_assessment ON assessment_questions(assessment_id, order_index);
CREATE INDEX idx_questions_institute  ON assessment_questions(institute_id);
-- Note: no GIN index on options JSONB — questions are always fetched by assessment_id,
-- never searched inside the options field. GIN here would add write overhead for zero benefit.
```

**No soft delete on `assessment_questions`:**
Questions are hard-deleted. The service enforces: questions can only be deleted when the assessment is in `draft` status. Once published/active/closed/evaluated, question deletion is blocked to prevent dangling `question_id` references in existing `submissions.answers` JSONB. To restructure questions on a published assessment, the admin must duplicate the assessment.

**Question image uploads:**
- Storage path: `/{institute_id}/questions/{question_id}.{ext}`
- Allowed formats: JPG, PNG — max 5MB
- Served via pre-signed URL (same 15-min pattern as materials)
- Not yet listed in Section 5 (File Storage) — add when implementing

---

### Table: `submissions`

One row per student per assessment. Tracks the full answer set and evaluation.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| assessment_id | UUID | NOT NULL, FK → assessments.id | Assessment reference |
| student_id | UUID | NOT NULL, FK → students.id | Student reference |
| answers | JSONB | NOT NULL, DEFAULT '[]' | Typed answers: [{question_id, type, selected_option, answer_text, marks_awarded, is_correct, feedback, flag_for_review}] |
| upload_files | JSONB | NOT NULL, DEFAULT '[]' | Written answer sheet uploads: [{url, file_name, file_type, size_bytes}] — JPG/PNG/PDF, max 20MB total |
| total_marks_awarded | NUMERIC(10,2) | | Calculated after evaluation — capped at 0, never negative |
| is_absent | BOOLEAN | NOT NULL, DEFAULT false | true if student never opened or submitted the assessment |
| flag_for_review | BOOLEAN | NOT NULL, DEFAULT false | Admin-only flag for submissions needing re-check |
| results_released_at | TIMESTAMPTZ | | When admin released results for this specific student |
| evaluation_type | VARCHAR(10) | CHECK (evaluation_type IN ('auto', 'manual')) | `auto` = MCQ system-evaluated on close; `manual` = admin-evaluated; NULL = not yet evaluated |
| evaluated_by | UUID | FK → users.id | Admin evaluator — NULL for auto-evaluated submissions |
| evaluated_at | TIMESTAMPTZ | | When evaluation was completed |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK (status IN ('pending', 'submitted', 'evaluated')) | pending / submitted / evaluated |
| submitted_at | TIMESTAMPTZ | | When student hit submit (or auto-submit at end_at) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (institute_id, assessment_id, student_id)
-- One submission per student per assessment
```

**Indexes:**
```sql
CREATE INDEX idx_submissions_institute  ON submissions(institute_id);
CREATE INDEX idx_submissions_assessment ON submissions(assessment_id);
CREATE INDEX idx_submissions_student    ON submissions(student_id);
CREATE INDEX idx_submissions_status     ON submissions(institute_id, status);
CREATE INDEX idx_submissions_created    ON submissions(institute_id, created_at DESC);
```

---

### Table: `payments`

Monthly fee record per student. The modal shows last 10 months.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| student_id | UUID | NOT NULL, FK → students.id | Student reference |
| month | DATE | NOT NULL, CHECK (EXTRACT(day FROM month) = 1) | First day of the month e.g. 2025-03-01 — DB enforces day=1 |
| amount | NUMERIC(10,2) | NOT NULL, CHECK (amount >= 0) | Fee amount at time of record creation (snapshot of student fee_amount) |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK (status IN ('pending', 'paid', 'overdue')) | pending / paid / overdue |
| paid_at | TIMESTAMPTZ | | When marked as paid |
| reference | VARCHAR(100) | | Payment reference — UPI transaction ID, NEFT ref, cash receipt number. Optional, admin-entered. |
| updated_by | UUID | FK → users.id | Admin who last edited status |
| notes | TEXT | | Optional admin remarks |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (institute_id, student_id, month)
-- One payment record per student per month
```

**Indexes:**
```sql
CREATE INDEX idx_payments_institute ON payments(institute_id, is_deleted);
CREATE INDEX idx_payments_student   ON payments(student_id, month DESC) WHERE is_deleted = false;
CREATE INDEX idx_payments_status    ON payments(institute_id, status)   WHERE is_deleted = false;
CREATE INDEX idx_payments_month     ON payments(institute_id, month DESC);

-- Dashboard stat: count pending payments
CREATE INDEX idx_payments_pending   ON payments(institute_id, status) WHERE status = 'pending'  AND is_deleted = false;

-- Overdue tab: all overdue records across all months
CREATE INDEX idx_payments_overdue   ON payments(institute_id, month DESC) WHERE status = 'overdue' AND is_deleted = false;

-- Auto-overdue cron: find pending records past grace period
CREATE INDEX idx_payments_pending_month ON payments(institute_id, month) WHERE status = 'pending' AND is_deleted = false;
```

**Payment auto-generation (NestJS @Cron):**
- Monthly cron on 1st of every month: creates `pending` records for all active (non-deleted) students using their current `fee_amount`
- When new student added: immediate `pending` record created for current month (full month charge regardless of join date)
- Daily cron: transitions `pending → overdue` for any payment where the month ended more than 5 days ago
  - Example: January payment → overdue on February 6th if still pending
  - Cron only touches `pending` records — never modifies `paid` or `overdue`
  - Overdue is sticky: stays overdue until admin explicitly marks as paid or pending

**Last 10 months query:**
```sql
SELECT * FROM payments
WHERE student_id = $1
  AND institute_id = $2
  AND month >= date_trunc('month', now()) - interval '9 months'
  AND is_deleted = false
ORDER BY month DESC;
```

---

### Table: `notifications`

Notifications created by admin — broadcast or targeted.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| title | VARCHAR(100) | NOT NULL | Notification heading (max 100 characters) |
| body | VARCHAR(500) | NOT NULL | Full notification content (max 500 characters) |
| type | VARCHAR(30) | NOT NULL, DEFAULT 'general', CHECK (type IN ('general', 'payment_reminder', 'assessment_reminder')) | general / payment_reminder / assessment_reminder |
| target | VARCHAR(20) | NOT NULL, DEFAULT 'all', CHECK (target IN ('all', 'specific', 'pending_overdue')) | all / specific / pending_overdue (payment_reminder only — requires payments feature enabled) |
| sent_by | UUID | NOT NULL, FK → users.id | Admin sender |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_notifications_institute ON notifications(institute_id, is_deleted);
CREATE INDEX idx_notifications_created   ON notifications(institute_id, created_at DESC);
```

---

### Table: `notification_recipients`

Per-student delivery and read tracking. One row per student per notification.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| notification_id | UUID | NOT NULL, FK → notifications.id ON DELETE CASCADE | Notification |
| student_id | UUID | NOT NULL, FK → students.id | Recipient |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | Read status for unread badge |
| read_at | TIMESTAMPTZ | | When student read it |
| is_dismissed | BOOLEAN | NOT NULL, DEFAULT false | Student dismissed from their own list (does not affect other students) |
| dismissed_at | TIMESTAMPTZ | | When student dismissed it |

**Constraints:**
```sql
UNIQUE (notification_id, student_id)
```

**Indexes:**
```sql
CREATE INDEX idx_notif_recipients_student ON notification_recipients(student_id, is_read);
CREATE INDEX idx_notif_recipients_notif   ON notification_recipients(notification_id);

-- Unread count badge query
CREATE INDEX idx_notif_unread ON notification_recipients(student_id, is_read)
  WHERE is_read = false;
```

---

### Table: `sessions`

Audit/history log of all login sessions. Records device info and token lifecycle for security review.

**Important — role clarification:**
This table is **not** used in the auth guard pipeline for session enforcement. The single-session enforcement mechanism queries `users.session_id` directly (see Section 3). `sessions` is an audit trail only — it records every login event with IP and device info. If you're debugging "why was a user logged out", check this table.

**What writes to it:** A new row is inserted on every login. `revoked_at` is set on logout or token-reuse attack detection.

**Cleanup:** A weekly cron job deletes rows where `expires_at < now() - interval '30 days'` to prevent unbounded growth.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| user_id | UUID | NOT NULL, FK → users.id | Token owner |
| session_id | UUID | NOT NULL | Mirrors users.session_id at time of creation |
| refresh_token_hash | VARCHAR(255) | NOT NULL | bcrypt hash of raw refresh token |
| ip_address | VARCHAR(45) | | Client IP (supports IPv6) |
| user_agent | TEXT | | Browser / device info |
| expires_at | TIMESTAMPTZ | NOT NULL | Refresh token expiry (7 days from creation) |
| revoked_at | TIMESTAMPTZ | | Set on logout or token reuse attack |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_sessions_user       ON sessions(user_id);
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_active     ON sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;
```

---

### Table: `audit_logs`

Append-only immutable record of every mutation. Never updated, never deleted.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| actor_id | UUID | NOT NULL, FK → users.id | Who performed the action |
| actor_role | VARCHAR(20) | NOT NULL | Role at time of action |
| action | VARCHAR(50) | NOT NULL, CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'HIDE', 'UNHIDE', 'EVALUATE', 'LOGIN', 'LOGOUT', 'BULK_UPLOAD', 'EXPORT', 'PUBLISH', 'RELEASE_RESULTS', 'PASSWORD_CHANGED', 'PASSWORD_RESET')) | Enum of all valid audit actions |
| resource_type | VARCHAR(50) | NOT NULL | users / students / materials / assessments / payments / notifications |
| resource_id | UUID | | ID of the affected record |
| old_values | JSONB | | State before mutation |
| new_values | JSONB | | State after mutation |
| ip_address | VARCHAR(45) | | Client IP at time of action |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Immutable — no updated_at |

**Indexes:**
```sql
CREATE INDEX idx_audit_institute ON audit_logs(institute_id, created_at DESC);
CREATE INDEX idx_audit_actor     ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_resource  ON audit_logs(institute_id, resource_type, resource_id);
CREATE INDEX idx_audit_action    ON audit_logs(institute_id, action);
```

**Hard rule:** No `UPDATE` or `DELETE` ever on this table. Supabase RLS can enforce this:
```sql
CREATE POLICY audit_insert_only ON audit_logs
  FOR INSERT WITH CHECK (true);
-- No UPDATE or DELETE policy = blocked
```

---

## ER Diagram

```
┌──────────────┐           ┌────────────────┐
│  institutes  │           │    features    │
│──────────────│           │────────────────│
│ id (PK)      │           │ id (PK)        │
│ name         │           │ key            │
│ email        │           │ label          │
│ slug         │           └───────┬────────┘
│ is_active    │                   │ 1
└──────┬───────┘                   │ M
       │ 1             ┌───────────▼──────────┐
       │               │  institute_features  │
       │               │──────────────────────│
       │       ┌───────│ institute_id (FK)    │
       │       │       │ feature_id (FK)      │
       │       │       │ enabled_at           │
       │       │       └──────────────────────┘
       │ 1:M
       ├───────────────────────────────────────────────────┐
       │                                                   │ 1:M
       │ 1:M                                    ┌──────────▼────────┐
┌──────▼───────┐                                │  study_materials  │
│    users     │                                │───────────────────│
│──────────────│                                │ id (PK)           │
│ id (PK)      │                                │ institute_id (FK) │
│ institute_id │                                │ title             │
│ role_id (FK) │                                │ subject / author  │
│ name         │                                │ file_url (MinIO)  │
│ email        │                                │ is_hidden         │
│ phone        │                                │ is_deleted        │
│ password_hash│                                └───────────────────┘
│ session_id   │
│ is_deleted   │
└──────┬───────┘
       │ 1
       │ 1:M                         ┌─────────────────────┐
       ├──────────────────────────── │      sessions       │
       │                             │─────────────────────│
       │                             │ id (PK)             │
       │                             │ institute_id (FK)   │
       │                             │ user_id (FK)        │
       │                             │ session_id          │
       │                             │ refresh_token_hash  │
       │                             │ expires_at          │
       │                             │ revoked_at          │
       │                             └─────────────────────┘
       │ 1:1
┌──────▼───────┐
│   students   │
│──────────────│
│ id (PK)      │◄──────────────────────────────────────────┐
│ institute_id │                                           │
│ user_id (FK) │                                           │
│ roll_number  │                                           │
│ class        │                                           │
│ school       │                                           │
│ fee_amount   │                                           │
│ is_deleted   │                                           │
└──────┬───────┘                                           │
       │                                                   │
       │ 1:M                  1:M                          │
       ├────────────────┐      │                           │
       │                │      │                           │
┌──────▼──────┐  ┌──────▼──────▼──┐                       │
│  payments   │  │  submissions   │                       │
│─────────────│  │────────────────│                       │
│ id (PK)     │  │ id (PK)        │                       │
│ institute_id│  │ institute_id   │                       │
│ student_id  │  │ assessment_id  │◄──────────────┐       │
│ month       │  │ student_id(FK)─┼───────────────┼───────┘
│ amount      │  │ answers (JSONB)│               │
│ status      │  │ upload_files   │      ┌────────▼──────────┐
│ is_deleted  │  │ is_absent      │      │   assessments     │
└─────────────┘  │ flag_for_review│      │───────────────────│
                 │ marks_awarded  │      │ id (PK)           │
                 │ status         │      │ institute_id (FK) │
                 └────────────────┘      │ title             │
                                         │ subjects (TEXT[]) │
                                         │ type / status     │
                                         │ start_at / end_at │
                                         │ neg_marking       │
                                         │ results_released  │
                                         │ is_deleted        │
                                         └────────┬──────────┘
                                                  │ 1:M
                                         ┌────────▼──────────┐
                                         │assess_questions   │
                                         │───────────────────│
                                         │ id (PK)           │
                                         │ institute_id (FK) │
                                         │ assessment_id(FK) │
                                         │ question_text     │
                                         │ type / marks      │
                                         │ options (JSONB)   │
                                         │ order_index       │
                                         └───────────────────┘

┌──────────────────────┐     ┌──────────────────────────┐
│    notifications     │1:M  │  notification_recipients │
│──────────────────────│────►│──────────────────────────│
│ id (PK)              │     │ notification_id (FK)     │
│ institute_id (FK)    │     │ student_id (FK)          │
│ title / body         │     │ is_read                  │
│ type                 │     │ read_at                  │
│ target (all/specific)│     │ is_dismissed             │
│ sent_by (FK)         │     └──────────────────────────┘
│ is_deleted           │
└──────────────────────┘

┌──────────────────────────────────────────────────┐
│                  audit_logs                      │
│──────────────────────────────────────────────────│
│ id (PK)                                          │
│ institute_id (FK)                                │
│ actor_id (FK → users)                            │
│ action (CREATE/UPDATE/DELETE/LOGIN/LOGOUT/...)   │
│ resource_type / resource_id                      │
│ old_values (JSONB) / new_values (JSONB)          │
│ created_at  ← APPEND ONLY. No update. No delete.│
└──────────────────────────────────────────────────┘
```

---

## Relationship Summary

| Relationship | Type | Description |
|---|---|---|
| institutes → users | 1:M | One institute has many admin and student users |
| institutes → institute_features | 1:M | One institute enables many features |
| features → institute_features | 1:M | One feature enabled across many institutes |
| users → students | 1:1 | Every student user has exactly one extended profile |
| users → sessions | 1:M | One user has session history; only one active at a time |
| students → submissions | 1:M | One student submits answers across many assessments |
| students → payments | 1:M | One student has one payment record per month |
| students → notification_recipients | 1:M | One student receives many notifications |
| assessments → assessment_questions | 1:M | One assessment contains many questions |
| assessments → submissions | 1:M | One assessment receives submissions from many students |
| notifications → notification_recipients | 1:M | One notification delivered to many students |
| institutes → audit_logs | 1:M | All tenant activity logged in one place |
| users → audit_logs | 1:M | All user mutations traceable to actor |

---

## Multi-Tenant Filtering Strategy

Every query in the repository layer follows this pattern — enforced by a base repository class that NestJS services extend:

```sql
-- SELECT: always filter by institute_id AND is_deleted
SELECT * FROM students
WHERE institute_id = $current_institute_id
  AND is_deleted   = false;

-- INSERT: always inject institute_id from request context
INSERT INTO students (institute_id, user_id, ...)
VALUES ($current_institute_id, $user_id, ...);

-- UPDATE: always include institute_id to prevent cross-tenant mutation
UPDATE students
SET class = $new_class
WHERE id           = $resource_id
  AND institute_id = $current_institute_id
  AND is_deleted   = false;

-- DELETE (soft): same constraint
UPDATE students
SET is_deleted = true,
    deleted_at = now(),
    deleted_by = $current_user_id
WHERE id           = $resource_id
  AND institute_id = $current_institute_id;
```

**Three enforcement layers — all must be breached for a cross-tenant leak:**

| Layer | How enforced | Guards against |
|---|---|---|
| JWT | `institute_id` is signed into the token | Forged institute IDs from client |
| Middleware | `InstituteContextMiddleware` overwrites any body `institute_id` | Developer forgetting to use context |
| Repository | Base repository injects `institute_id` into every query | Individual query bugs |

---

## Indexing Strategy

**Requirement from spec:** Indexes must be created on `institute_id`, `student_id`, `email`, `created_at` across all major tables.

### Pattern 1 — Primary access index (every major table)
```sql
-- List all active records for an institute (most common query)
CREATE INDEX idx_<table>_institute ON <table>(institute_id, is_deleted);
```

### Pattern 2 — Partial indexes (exclude deleted rows from index entirely)
```sql
-- Keeps index small and fast — deleted rows never scanned
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_students_class ON students(institute_id, class) WHERE is_deleted = false;
CREATE INDEX idx_payments_status ON payments(institute_id, status) WHERE is_deleted = false;
```

### Pattern 3 — Time-based descending indexes (lists and dashboard stats)
```sql
-- Latest records first — used by all list endpoints
CREATE INDEX idx_<table>_created ON <table>(institute_id, created_at DESC);

-- Payment month ordering for 10-month modal
CREATE INDEX idx_payments_student ON payments(student_id, month DESC);

-- Audit log timeline
CREATE INDEX idx_audit_institute ON audit_logs(institute_id, created_at DESC);
```

### Pattern 4 — Status-specific partial indexes (dashboard counters)
```sql
-- Dashboard: pending payments count
CREATE INDEX idx_payments_pending ON payments(institute_id, status)
  WHERE status = 'pending' AND is_deleted = false;

-- Dashboard: upcoming assessments
CREATE INDEX idx_assessments_active ON assessments(institute_id, start_at, end_at)
  WHERE status IN ('published', 'active') AND is_deleted = false;
```

### Pattern 5 — Full-text search (GIN indexes)
```sql
-- Student search bar (searches name + email + phone)
-- Uses 'simple' config — no stemming for proper nouns (Indian names).
-- Phone numbers are not included in GIN — use trigram or LIKE for partial phone search.
CREATE INDEX idx_students_search ON users
  USING GIN (to_tsvector('simple', name || ' ' || COALESCE(email,'')))
  WHERE is_deleted = false;

-- Trigram index for partial phone number search (e.g. searching "9876" matches "9876543210")
CREATE INDEX idx_users_phone_trgm ON users
  USING GIN (phone gin_trgm_ops)
  WHERE is_deleted = false AND phone IS NOT NULL;

-- Study materials search bar (title + subject + author)
CREATE INDEX idx_materials_search ON study_materials
  USING GIN (to_tsvector('simple', title || ' ' || subject || ' ' || COALESCE(author,'')))
  WHERE is_deleted = false;
```

**Note on language config:** `'simple'` is used instead of `'english'` throughout. English config applies stemming (e.g. "running" → "run") which corrupts proper nouns. `'simple'` tokenises and lowercases only — correct for names, emails, and titles.

### Pattern 6 — JSONB GIN indexes

**Not used.** The following indexes were considered but deliberately omitted:

```sql
-- REMOVED: assessment_questions.options — questions are always fetched by assessment_id,
-- never searched inside options JSONB. GIN here adds write overhead for zero query benefit.

-- REMOVED: submissions.answers — submissions are always fetched by assessment_id or student_id,
-- never searched inside the answers field.
```

If a future use case genuinely requires JSONB search, add these indexes at that point.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| UUID primary keys | No sequential ID exposure; safe to use in URLs and API responses |
| `TIMESTAMPTZ` everywhere | All timestamps in UTC; no timezone-related bugs on Supabase |
| `JSONB` for answers and MCQ options | Assessment structure varies per question — avoids EAV anti-pattern |
| `month DATE` in payments | Enables native date arithmetic for the 10-month window query |
| `TEXT[]` for assessment subjects | Multi-subject assessments without a join table |
| Separate `notification_recipients` | Scales to large student counts; enables per-student unread badge |
| `is_hidden` separate from `is_deleted` on materials | Admin can hide/unhide without losing the record |
| `audit_logs` append-only with Supabase RLS | Tamper-proof compliance trail |
| `sessions` table separate from `users` | Clean refresh token rotation without modifying user record |
| GIN index on materials title/subject/author | Powers the student-facing material search feature from requirements |
| Partial indexes with `WHERE is_deleted = false` | Deleted rows excluded from index — keeps indexes lean as data grows |
| `students.class` + `students.school` (NOT `batch`) | Batch removed — class and school are required fields; enable dropdown filters in UI |
| `students.fee_amount` on students table | Monthly fee is per-student; payments table snapshots the amount at record creation time |
| `submissions.upload_files JSONB` | Dual submission mode — students can type answers AND upload answer sheet files |
| `submissions.is_absent` | Students who never submitted auto-marked absent; marks default to 0 without admin action |
| `assessments.results_released` | Controls when students can see their marks — per-assessment flag, admin-controlled |
| `assessments.negative_marking_*` | Per-assessment negative marking configuration; total marks capped at 0 |
| `notifications.title VARCHAR(100)` + `body VARCHAR(500)` | Short limits enforced at DB level; in-app only, no email/SMS in V1 |
| `notification_recipients.is_dismissed` | Student dismiss removes from their view only — other students unaffected |
| `users.email UNIQUE` globally | Login lookup is global; prevents same email in two institutes |
| Auth token fields on `users` table | Verification + reset tokens stored hashed; `must_change_password` for new students |
| `CHECK` constraints on all enum/status columns | DB-level guard against silent data corruption from application bugs; last line of defense |
| `payments.month CHECK (day = 1)` | Enforces that month is always the 1st — prevents off-by-one bugs in cron and date arithmetic |
| `correct_option` is sole truth for MCQ answer | `is_correct` removed from `options` JSONB — two sources of truth would allow drift; derived at query time |
| No GIN on `options` or `answers` JSONB | These are always fetched by FK, never searched inside; GIN would add write overhead with no read benefit |
| Full-text search uses `'simple'` language config | `'english'` applies stemming which corrupts Indian proper nouns; `'simple'` tokenises and lowercases only |
| Trigram index for phone search | GIN full-text cannot match partial phone numbers; `pg_trgm` handles prefix/substring matching correctly |
| `payments.reference VARCHAR(100)` | Stores UPI/NEFT/cash receipt reference numbers; prevents `notes` becoming a structured data dump |
| `submissions.evaluation_type` | Distinguishes system auto-evaluation (MCQ close) from manual admin evaluation; `evaluated_by = NULL` is ambiguous without it |
| `sessions` table is audit-only | Single-session enforcement uses `users.session_id`; `sessions` is a security audit log, not queried in the guard pipeline |
| `assessment_questions` no soft delete | Questions hard-deleted; service blocks deletion on published/active/closed assessments to protect `submissions.answers` JSONB integrity |
