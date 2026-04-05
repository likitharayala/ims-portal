# IMS Portal — Database Schema (Section 2)

All tables follow these non-negotiable rules:
- Every table (except `roles`, `features`) has `institute_id` — all queries filter by it
- Soft delete: `is_deleted`, `deleted_at`, `deleted_by` on every mutable table
- Audit trail: mutations write to `audit_logs`
- UUIDs as primary keys throughout

---

## Table Definitions

---

### Table: institutes

The root tenant record. Every other record traces back here.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| name | VARCHAR(255) | NOT NULL | Institute display name |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Contact email |
| phone | VARCHAR(20) | NOT NULL | Contact phone |
| slug | VARCHAR(100) | NOT NULL, UNIQUE | URL-safe identifier |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Account active status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update timestamp |

**Indexes:**
```sql
CREATE UNIQUE INDEX idx_institutes_email ON institutes(email);
CREATE UNIQUE INDEX idx_institutes_slug  ON institutes(slug);
```

**Notes:** No soft delete — institutes are deactivated via `is_active = false`.

---

### Table: roles

Static lookup table. Seeded at deployment, never modified at runtime.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SMALLINT | PK | 1 = admin, 2 = student, 3 = teacher (Phase 5), 4 = super_admin (Phase 5) |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Role name |
| description | TEXT | | Role description |

**Seed data:**
```sql
INSERT INTO roles (id, name) VALUES
  (1, 'admin'),
  (2, 'student');
```

---

### Table: features

Static lookup of all available feature toggles. Seeded at deployment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SMALLINT | PK | Stable identifier |
| key | VARCHAR(50) | NOT NULL, UNIQUE | Machine key: students, materials, assessments, payments, ai_generation |
| label | VARCHAR(100) | NOT NULL | Display name |
| description | TEXT | | What the feature unlocks |

**Seed data:**
```sql
INSERT INTO features (id, key, label) VALUES
  (1, 'students',    'Students Data'),
  (2, 'materials',   'Study Materials'),
  (3, 'assessments', 'Assessments'),
  (4, 'payments',    'Payments'),
  (5, 'ai_generation', 'AI Generation');
```

---

### Table: institute_features

Junction table — which features each institute has enabled.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| feature_id | SMALLINT | NOT NULL, FK → features.id | Feature reference |
| enabled_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | When feature was enabled |
| enabled_by | UUID | FK → users.id | Admin who enabled it |

**Constraints:**
```sql
UNIQUE (institute_id, feature_id)
```

**Indexes:**
```sql
CREATE INDEX idx_inst_features_institute ON institute_features(institute_id);
```

---

### Table: users

All authenticated users — both admins and students share this table, differentiated by `role_id`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| role_id | SMALLINT | NOT NULL, FK → roles.id | 1=admin, 2=student |
| name | VARCHAR(255) | NOT NULL | Full name |
| email | VARCHAR(255) | NOT NULL | Login email |
| phone | VARCHAR(20) | | Login phone (alternative to email) |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| session_id | UUID | | Current active session (single-session enforcement) |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Account enabled |
| last_login_at | TIMESTAMPTZ | | Last successful login |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft delete flag |
| deleted_at | TIMESTAMPTZ | | When soft-deleted |
| deleted_by | UUID | FK → users.id | Who deleted |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (institute_id, email)
UNIQUE (institute_id, phone)
```

**Indexes:**
```sql
CREATE INDEX idx_users_institute       ON users(institute_id, is_deleted);
CREATE INDEX idx_users_email           ON users(institute_id, email) WHERE is_deleted = false;
CREATE INDEX idx_users_phone           ON users(institute_id, phone) WHERE is_deleted = false;
CREATE INDEX idx_users_role            ON users(institute_id, role_id) WHERE is_deleted = false;
```

**Notes:** `session_id` is regenerated on every login, invalidating all previous sessions.

---

### Table: students

Extended profile for student users. One-to-one with `users` where `role_id = 2`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| user_id | UUID | NOT NULL, UNIQUE, FK → users.id | Linked auth user |
| roll_number | VARCHAR(50) | | Institute-assigned roll number |
| date_of_birth | DATE | | |
| address | TEXT | | |
| parent_name | VARCHAR(255) | | |
| parent_phone | VARCHAR(20) | | |
| batch | VARCHAR(100) | | Class/batch name |
| join_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | |
| profile_image_url | TEXT | | MinIO path |
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
CREATE INDEX idx_students_user       ON students(user_id);
CREATE INDEX idx_students_batch      ON students(institute_id, batch) WHERE is_deleted = false;
```

---

### Table: study_materials

Each row is a material card shown in the Study Materials module.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| title | VARCHAR(255) | NOT NULL | Book/material title |
| subject | VARCHAR(100) | NOT NULL | Subject label |
| author | VARCHAR(255) | | Author name |
| description | TEXT | | Short description |
| file_url | TEXT | NOT NULL | MinIO path |
| file_type | VARCHAR(20) | NOT NULL | pdf, docx, etc. |
| file_size_bytes | BIGINT | | File size |
| is_hidden | BOOLEAN | NOT NULL, DEFAULT false | Hidden from students (not deleted) |
| uploaded_by | UUID | NOT NULL, FK → users.id | Admin uploader |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_materials_institute ON study_materials(institute_id, is_deleted, is_hidden);
CREATE INDEX idx_materials_subject   ON study_materials(institute_id, subject) WHERE is_deleted = false;
```

**Notes:** `is_hidden = true` means admin hid it from students — still visible to admin. Different from `is_deleted`.

---

### Table: assessments

Each row is an assessment card. Supports MCQ, Descriptive, or Both.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| title | VARCHAR(255) | NOT NULL | Assessment title |
| subjects | TEXT[] | NOT NULL | Array of subjects covered |
| type | VARCHAR(20) | NOT NULL | mcq / descriptive / mixed |
| total_marks | INTEGER | NOT NULL | Sum of all question marks |
| start_at | TIMESTAMPTZ | NOT NULL | When students can begin |
| end_at | TIMESTAMPTZ | NOT NULL | Deadline |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | draft / published / active / closed / evaluated |
| ai_generated | BOOLEAN | NOT NULL, DEFAULT false | Was content AI-generated |
| instructions | TEXT | | Instructions shown to student |
| created_by | UUID | NOT NULL, FK → users.id | Admin who created |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_assessments_institute ON assessments(institute_id, is_deleted);
CREATE INDEX idx_assessments_status    ON assessments(institute_id, status) WHERE is_deleted = false;
CREATE INDEX idx_assessments_timing    ON assessments(institute_id, start_at, end_at) WHERE is_deleted = false;
```

---

### Table: assessment_questions

Individual questions belonging to an assessment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| assessment_id | UUID | NOT NULL, FK → assessments.id | Parent assessment |
| question_text | TEXT | NOT NULL | The question |
| type | VARCHAR(20) | NOT NULL | mcq / descriptive |
| marks | INTEGER | NOT NULL | Marks for this question |
| difficulty | VARCHAR(10) | NOT NULL | easy / medium / hard |
| options | JSONB | | MCQ options: [{label, text, is_correct}] |
| correct_option | VARCHAR(5) | | MCQ correct option label (A/B/C/D) |
| order_index | SMALLINT | NOT NULL, DEFAULT 0 | Display order |
| image_url | TEXT | | Optional question image (MinIO) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_questions_assessment ON assessment_questions(assessment_id);
CREATE INDEX idx_questions_institute  ON assessment_questions(institute_id);
```

---

### Table: submissions

A student's submission for one assessment. One row per student per assessment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| assessment_id | UUID | NOT NULL, FK → assessments.id | Assessment reference |
| student_id | UUID | NOT NULL, FK → students.id | Student reference |
| answers | JSONB | NOT NULL, DEFAULT '[]' | [{question_id, answer_text, image_url, selected_option}] |
| total_marks_awarded | INTEGER | | Filled after evaluation |
| evaluated_by | UUID | FK → users.id | Admin evaluator |
| evaluated_at | TIMESTAMPTZ | | When evaluation was completed |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending / submitted / evaluated |
| submitted_at | TIMESTAMPTZ | | When student submitted |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (institute_id, assessment_id, student_id)
```

**Indexes:**
```sql
CREATE INDEX idx_submissions_institute  ON submissions(institute_id);
CREATE INDEX idx_submissions_assessment ON submissions(assessment_id);
CREATE INDEX idx_submissions_student    ON submissions(student_id);
CREATE INDEX idx_submissions_status     ON submissions(institute_id, status);
```

---

### Table: payments

Monthly fee payment record per student. Tracks the last N months.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| student_id | UUID | NOT NULL, FK → students.id | Student reference |
| month | DATE | NOT NULL | First day of the payment month (e.g. 2025-03-01) |
| amount | NUMERIC(10,2) | NOT NULL | Fee amount |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending / paid / overdue |
| paid_at | TIMESTAMPTZ | | When marked as paid |
| updated_by | UUID | FK → users.id | Admin who updated status |
| notes | TEXT | | Optional remarks |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraints:**
```sql
UNIQUE (institute_id, student_id, month)
```

**Indexes:**
```sql
CREATE INDEX idx_payments_institute ON payments(institute_id, is_deleted);
CREATE INDEX idx_payments_student   ON payments(student_id, month DESC) WHERE is_deleted = false;
CREATE INDEX idx_payments_status    ON payments(institute_id, status) WHERE is_deleted = false;
```

---

### Table: notifications

Notifications sent by admin to all students or specific students.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| title | VARCHAR(255) | NOT NULL | Notification heading |
| body | TEXT | NOT NULL | Notification content |
| target | VARCHAR(20) | NOT NULL, DEFAULT 'all' | all / specific |
| sent_by | UUID | NOT NULL, FK → users.id | Admin sender |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_at | TIMESTAMPTZ | | |
| deleted_by | UUID | FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_notifications_institute ON notifications(institute_id, is_deleted);
```

---

### Table: notification_recipients

Tracks delivery and read status per student. One row per student per notification.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| notification_id | UUID | NOT NULL, FK → notifications.id | Notification reference |
| student_id | UUID | NOT NULL, FK → students.id | Recipient |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | Read status |
| read_at | TIMESTAMPTZ | | When read |

**Constraints:**
```sql
UNIQUE (notification_id, student_id)
```

**Indexes:**
```sql
CREATE INDEX idx_notif_recipients_student ON notification_recipients(student_id, is_read);
CREATE INDEX idx_notif_recipients_notif   ON notification_recipients(notification_id);
```

---

### Table: sessions

Tracks active JWT refresh tokens. Enables refresh token rotation and revocation.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| user_id | UUID | NOT NULL, FK → users.id | Token owner |
| session_id | UUID | NOT NULL | Matches users.session_id |
| refresh_token_hash | VARCHAR(255) | NOT NULL | bcrypt hash of refresh token |
| ip_address | VARCHAR(45) | | Client IP (IPv4/IPv6) |
| user_agent | TEXT | | Browser/client info |
| expires_at | TIMESTAMPTZ | NOT NULL | Refresh token expiry |
| revoked_at | TIMESTAMPTZ | | Set when logged out or session stolen |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:**
```sql
CREATE INDEX idx_sessions_user       ON sessions(user_id);
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_expires    ON sessions(expires_at) WHERE revoked_at IS NULL;
```

---

### Table: audit_logs

Immutable log of every mutation. Never updated or deleted.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| institute_id | UUID | NOT NULL, FK → institutes.id | Tenant reference |
| actor_id | UUID | NOT NULL, FK → users.id | Who performed the action |
| actor_role | VARCHAR(20) | NOT NULL | Role at time of action |
| action | VARCHAR(50) | NOT NULL | CREATE / UPDATE / DELETE / HIDE / EVALUATE / LOGIN / LOGOUT |
| resource_type | VARCHAR(50) | NOT NULL | students / materials / assessments / payments / notifications |
| resource_id | UUID | | ID of the affected row |
| old_values | JSONB | | State before change |
| new_values | JSONB | | State after change |
| ip_address | VARCHAR(45) | | Client IP |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Immutable timestamp |

**Indexes:**
```sql
CREATE INDEX idx_audit_institute    ON audit_logs(institute_id, created_at DESC);
CREATE INDEX idx_audit_actor        ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource     ON audit_logs(institute_id, resource_type, resource_id);
```

**Notes:** No UPDATE or DELETE ever on this table. Append-only.

---

## ER Diagram

```
┌─────────────────┐         ┌──────────────────┐
│   institutes    │         │     features      │
│─────────────────│         │──────────────────│
│ id (PK)         │         │ id (PK)          │
│ name            │         │ key              │
│ email           │         │ label            │
│ phone           │         └──────────────────┘
│ slug            │                  │
│ is_active       │                  │ M
└────────┬────────┘                  │
         │ 1                ┌────────▼──────────┐
         │                  │ institute_features │
         │                  │──────────────────│
         │           ┌──────│ institute_id (FK) │
         │           │      │ feature_id (FK)   │
         │           │      └───────────────────┘
         │ 1         │
         ├───────────┼─────────────────────────────────────────────┐
         │           │                                             │
         │ M         │ M                                           │ M
┌────────▼────────┐  │                                   ┌────────▼─────────┐
│     users       │  │                                   │  study_materials  │
│─────────────────│  │                                   │──────────────────│
│ id (PK)         │  │                                   │ id (PK)          │
│ institute_id(FK)│  │                                   │ institute_id(FK) │
│ role_id (FK)    │  │                                   │ title            │
│ name            │  │                                   │ subject          │
│ email           │  │                                   │ file_url         │
│ phone           │  │                                   │ is_hidden        │
│ password_hash   │  │                                   │ uploaded_by(FK)  │
│ session_id      │  │                                   │ is_deleted       │
│ is_deleted      │  │                                   └──────────────────┘
└────────┬────────┘  │
         │ 1         │ M
         │    ┌──────▼──────────┐
         │    │    sessions     │
         │    │─────────────────│
         │    │ id (PK)         │
         │    │ institute_id(FK)│
         │    │ user_id (FK)    │
         │    │ session_id      │
         │    │ refresh_token.. │
         │    │ expires_at      │
         │    └─────────────────┘
         │ 1
┌────────▼────────┐
│    students     │
│─────────────────│
│ id (PK)         │
│ institute_id(FK)│
│ user_id (FK)    │◄──────────────────────────────────┐
│ roll_number     │                                   │
│ batch           │                                   │
│ is_deleted      │                                   │
└────────┬────────┘                                   │
         │                                            │
         │ 1                                          │
         ├──────────────────────┐                     │
         │                      │                     │
         │ M                    │ M                   │
┌────────▼────────┐    ┌────────▼──────────┐          │
│    payments     │    │    submissions    │          │
│─────────────────│    │───────────────────│          │
│ id (PK)         │    │ id (PK)           │          │
│ institute_id(FK)│    │ institute_id(FK)  │          │
│ student_id (FK) │    │ assessment_id(FK) │          │
│ month           │    │ student_id (FK)   │          │
│ amount          │    │ answers (JSONB)   │          │
│ status          │    │ marks_awarded     │          │
│ is_deleted      │    │ status            │          │
└─────────────────┘    └────────┬──────────┘          │
                                │ M                   │
                       ┌────────▼──────────┐          │
                       │   assessments     │          │
                       │───────────────────│          │
                       │ id (PK)           │          │
                       │ institute_id(FK)  │          │
                       │ title             │          │
                       │ type              │          │
                       │ status            │          │
                       │ start_at / end_at │          │
                       │ is_deleted        │          │
                       └────────┬──────────┘          │
                                │ 1                   │
                                │ M                   │
                       ┌────────▼──────────┐          │
                       │assess_questions   │          │
                       │───────────────────│          │
                       │ id (PK)           │          │
                       │ institute_id(FK)  │          │
                       │ assessment_id(FK) │          │
                       │ question_text     │          │
                       │ type / marks      │          │
                       │ options (JSONB)   │          │
                       └───────────────────┘          │
                                                      │
┌──────────────────────┐    ┌───────────────────────┐ │
│    notifications     │    │ notification_recipients│ │
│──────────────────────│    │───────────────────────│ │
│ id (PK)              │1──M│ notification_id (FK)  │ │
│ institute_id (FK)    │    │ student_id (FK) ───────┘ │
│ title / body         │    │ is_read                  │
│ target (all/specific)│    │ read_at                  │
│ sent_by (FK)         │    └───────────────────────┘
│ is_deleted           │
└──────────────────────┘

┌─────────────────────────────────────────────┐
│                audit_logs                   │
│─────────────────────────────────────────────│
│ id (PK)                                     │
│ institute_id (FK)                           │
│ actor_id (FK → users)                       │
│ action (CREATE/UPDATE/DELETE/...)           │
│ resource_type / resource_id                 │
│ old_values (JSONB) / new_values (JSONB)     │
│ created_at  ← append only, never mutated   │
└─────────────────────────────────────────────┘
```

---

## Relationship Summary

| Relationship | Type | Description |
|---|---|---|
| institutes → users | 1:M | One institute has many users (admins + students) |
| institutes → institute_features | 1:M | One institute enables many features |
| features → institute_features | 1:M | One feature can be enabled by many institutes |
| users → students | 1:1 | Every student user has one extended profile |
| students → submissions | 1:M | One student makes many assessment submissions |
| students → payments | 1:M | One student has many monthly payment records |
| students → notification_recipients | 1:M | One student receives many notifications |
| assessments → assessment_questions | 1:M | One assessment has many questions |
| assessments → submissions | 1:M | One assessment has many student submissions |
| notifications → notification_recipients | 1:M | One notification sent to many students |
| users → sessions | 1:M | One user can have session history (only 1 active at a time) |
| users → audit_logs | 1:M | Every user's mutations are logged |
| institutes → audit_logs | 1:M | All tenant activity in one place |

---

## Multi-Tenant Filtering Strategy

Every query at the repository layer must be constructed as follows:

```sql
-- Pattern applied to every SELECT
WHERE institute_id = $current_institute_id
  AND is_deleted = false          -- on all soft-deletable tables

-- Pattern applied to every INSERT
institute_id = $current_institute_id   -- injected by middleware, never from client input

-- Pattern applied to every UPDATE/DELETE
WHERE id = $resource_id
  AND institute_id = $current_institute_id   -- prevents cross-tenant mutation
```

**Three-layer enforcement:**

| Layer | Mechanism | Protects against |
|---|---|---|
| Middleware | `institute_id` extracted from JWT, attached to request context | Forged institute IDs in request body |
| Repository | `institute_id` injected into every query from request context | Missing filter bugs in business logic |
| Database | Composite indexes on `(institute_id, ...)` | Full table scans, accidental cross-tenant reads |

---

## Indexing Strategy

### Composite index pattern (applied to every major table)

```sql
-- Primary access pattern: list all active records for an institute
CREATE INDEX idx_<table>_institute ON <table>(institute_id, is_deleted);

-- Status/type filtering within an institute
CREATE INDEX idx_<table>_status ON <table>(institute_id, status) WHERE is_deleted = false;
```

### Partial indexes (use `WHERE` clause to exclude deleted rows)

All read queries exclude deleted records — partial indexes eliminate those rows from the index entirely, keeping indexes small and fast:

```sql
CREATE INDEX idx_users_email ON users(institute_id, email) WHERE is_deleted = false;
CREATE INDEX idx_students_batch ON students(institute_id, batch) WHERE is_deleted = false;
CREATE INDEX idx_payments_status ON payments(institute_id, status) WHERE is_deleted = false;
```

### Time-based indexes (for dashboard stats and sorted lists)

```sql
CREATE INDEX idx_payments_student   ON payments(student_id, month DESC);
CREATE INDEX idx_audit_institute    ON audit_logs(institute_id, created_at DESC);
CREATE INDEX idx_sessions_expires   ON sessions(expires_at) WHERE revoked_at IS NULL;
```

### Full-text search (Phase 1 — students search bar)

```sql
CREATE INDEX idx_students_search ON users
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '')))
  WHERE is_deleted = false;
```

### JSONB indexes (for querying answers and options)

```sql
CREATE INDEX idx_questions_options ON assessment_questions USING GIN (options);
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| UUID primary keys | No sequential ID leakage across tenants; safe to expose in URLs |
| `TIMESTAMPTZ` (not `TIMESTAMP`) | All times stored in UTC; avoids timezone bugs |
| `JSONB` for answers and MCQ options | Assessment structure varies per question; avoids EAV pattern |
| `month DATE` in payments (not VARCHAR) | Enables date arithmetic (last 10 months = `WHERE month >= date_trunc('month', now()) - interval '9 months'`) |
| `TEXT[]` for assessment subjects | Assessments span multiple subjects; array avoids join table for simple case |
| Separate `notification_recipients` table | Enables per-student read tracking and targeted sends at scale |
| `audit_logs` append-only | Legal/compliance trail; never modify old audit entries |
| `sessions` table separate from `users` | Keeps users table clean; enables refresh token rotation without touching user record |
