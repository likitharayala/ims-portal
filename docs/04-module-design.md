# Teachly — Backend Module Design (Section 4)

**Pattern:** Every module follows NestJS layered architecture → `Controller → Service → Repository`
**Hard rules applied to every module:**
- `institute_id` injected from JWT via `InstituteContextMiddleware` — never from request body
- All list queries filter `WHERE institute_id = $1 AND is_deleted = false`
- All mutations write to `audit_logs` after the primary operation succeeds
- Pagination: fixed 20 items per page
- All timestamps stored UTC, displayed in IST in the frontend
- Role guard + Feature guard applied on every protected route

---

## Module 1 — Students

### 1.1 Controller Endpoints

| Method | Route | Role | Feature Required |
|---|---|---|---|
| GET | `/admin/students` | admin | students |
| GET | `/admin/students/export` | admin | students |
| GET | `/admin/students/bulk-upload/template` | admin | students |
| GET | `/admin/students/filter-options` | admin | students |
| GET | `/admin/students/:id` | admin | students |
| GET | `/admin/students/:id/performance` | admin | students |
| POST | `/admin/students` | admin | students |
| POST | `/admin/students/bulk-upload` | admin | students |
| PUT | `/admin/students/:id` | admin | students |
| DELETE | `/admin/students/:id` | admin | students |
| POST | `/admin/students/:id/reinstate` | admin | students |
| POST | `/admin/students/:id/profile-photo` | admin | students |
| GET | `/student/profile` | student | — |
| PUT | `/student/profile` | student | — |
| POST | `/student/profile/photo` | student | — |

---

### 1.2 Service Flow

#### `listStudents(query, context)`

```
1. Build filter from query params:
   - search: apply GIN full-text search on users(name, email, phone)
             for class/school: additional WHERE students.class ILIKE or students.school ILIKE
   - filter.class  → WHERE students.class = $class (exact, from dropdown)
   - filter.school → WHERE students.school = $school (exact, from dropdown)
   - sort: created_at DESC (default) | name ASC/DESC | class ASC/DESC
2. JOIN users ON students.user_id = users.id
3. WHERE institute_id = $ctx.instituteId AND students.is_deleted = false
4. Paginate: LIMIT 20 OFFSET (page - 1) * 20
5. Return { data[], meta: { page, limit, total } }
```

#### `createStudent(dto, context)`

```
1. Validate required fields: name, email, phone, class, school, fee_amount
2. Check email uniqueness globally: SELECT FROM users WHERE email = $email
   → If exists: throw ConflictException('Email already in use')
3. Generate temporary password: 8-character alphanumeric (crypto.randomBytes)
4. Hash password: bcrypt.hash(tempPassword, 12)
5. BEGIN TRANSACTION:
   a. INSERT INTO users (institute_id, role_id=2, name, email, phone,
                         password_hash, must_change_password=true, is_email_verified=true)
   b. INSERT INTO students (institute_id, user_id, roll_number, class, school,
                             fee_amount, date_of_birth, address, parent_name,
                             parent_phone, join_date)
   c. INSERT INTO payments (institute_id, student_id, month=first_day_of_current_month,
                             amount=fee_amount, status='pending')
      → This is the immediate current-month payment record
6. COMMIT
7. AuditLog: action=CREATE, resource_type=students, resource_id=student.id
8. Return { student, temporaryPassword }
   → temporaryPassword returned ONCE in response — never stored in plaintext
```

**Temp password generation rule:**
- 8 characters
- Mix of uppercase, lowercase, digits
- Generated using `crypto.randomBytes` → Base62 encode → slice to 8

#### `bulkUploadStudents(file, context)`

```
1. Validate file MIME type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
2. Parse .xlsx using ExcelTemplateService
3. Validate required columns exist: Name, Email, Phone, Class, School, Fee Amount
   → If any required column missing or renamed: reject entire file immediately
4. Validate each row:
   - Required fields non-empty: name, email, phone, class, school, fee_amount
   - Email format valid
   - fee_amount is a positive number
   - Check duplicate email within file (accumulate errors)
   - Check duplicate email against existing DB records
   → Invalid rows are skipped, errors collected
5. For each valid row:
   a. Generate temp password
   b. bcrypt.hash(tempPassword, 12)
   c. INSERT users + students + payment record (same as createStudent)
6. After all rows processed:
   - Build summary: { created: N, skipped: M, errors: [{ row, reason }] }
   - Build one-time credentials array: [{ email, temporaryPassword }]
7. AuditLog: action=BULK_UPLOAD, resource_type=students, new_values={ created, skipped }
8. Return { summary, credentialsCSV: base64-encoded CSV string }
   → credentialsCSV is NOT stored on server — generated once in memory
```

#### `updateStudent(id, dto, context)`

```
1. Fetch student WHERE id = $id AND institute_id = $ctx.instituteId AND is_deleted = false
   → If not found: throw NotFoundException
2. Validate updatable fields (email is NOT in the allowed update fields)
3. Capture old_values for audit log
4. BEGIN TRANSACTION:
   a. UPDATE students SET (class, school, roll_number, fee_amount, date_of_birth,
                            address, parent_name, parent_phone, join_date, profile_image_url)
   b. UPDATE users SET (name, phone)
5. COMMIT
6. AuditLog: action=UPDATE, resource_type=students, old_values, new_values
7. Return updated student object
```

**Fields admin can edit:** name, phone, class, school, roll_number, fee_amount, date_of_birth, address, parent_name, parent_phone, join_date
**Field admin cannot edit:** email (locked after creation in V1)

#### `softDeleteStudent(id, context)`

```
1. Fetch student WHERE id = $id AND institute_id = $ctx.instituteId AND is_deleted = false
2. BEGIN TRANSACTION:
   a. UPDATE students SET is_deleted=true, deleted_at=now(), deleted_by=$ctx.userId
   b. UPDATE users    SET is_deleted=true, deleted_at=now(), deleted_by=$ctx.userId,
                          session_id=NULL, refresh_token_hash=NULL
      → Immediate session invalidation: next request from this student will fail session check
3. COMMIT
4. AuditLog: action=DELETE, resource_type=students, resource_id=student.id
5. Return { success: true }
```

**Payment visibility after deletion:**
- Records with `status = 'pending'` or `status = 'overdue'` → remain visible in Payments module
- Records with `status = 'paid'` → hidden along with the student
- Logic handled in PaymentsService.listPayments, not here

#### `exportStudents(context)`

```
1. SELECT all students WHERE institute_id = $ctx.instituteId AND is_deleted = false
   JOIN users ON students.user_id = users.id
   ORDER BY students.created_at DESC
   (No pagination — export all)
2. Build Excel using ExcelTemplateService
3. Columns: Name, Email, Phone, Class, School, Roll Number, Date of Birth,
            Parent Name, Parent Phone, Joined Date, Fee Amount, Credential Status
4. Credential Status = 'Password Changed' if must_change_password=false, else 'Not Logged In'
5. Return Excel file as buffer with Content-Disposition: attachment
6. AuditLog: action=EXPORT, resource_type=students
```

#### `getFilterOptions(context)` — populates class and school dropdowns

```
1. SELECT DISTINCT class FROM students
   WHERE institute_id = $ctx.instituteId AND is_deleted = false
   ORDER BY class ASC

2. SELECT DISTINCT school FROM students
   WHERE institute_id = $ctx.instituteId AND is_deleted = false
   ORDER BY school ASC

3. Return { classes: string[], schools: string[] }
```

#### `downloadBulkUploadTemplate(context)` — Excel template download

```
1. ExcelTemplateService.generateTemplate()
2. Template columns (in order):
   Name* | Email* | Phone* | Class* | School* | Fee Amount* |
   Roll Number | Date of Birth | Address | Parent Name | Parent Phone
   (* = required, rest optional)
3. Include one sample row in the template
4. Return Excel buffer with Content-Disposition: attachment; filename="student-upload-template.xlsx"
5. AuditLog: NOT logged (read-only utility)
```

#### `uploadProfilePhoto(studentId, file, context)` — admin uploads student photo

```
1. Fetch student WHERE id AND institute_id AND is_deleted = false
2. Validate file: MIME (image/jpeg, image/png) + extension + max 5MB
3. Upload to MinIO: /{institute_id}/profiles/{student_id}.{ext}
   (Overwrites existing photo at same path — no versioning)
4. UPDATE students SET profile_image_url = minio_path
5. AuditLog: action=UPDATE, resource_type=students, new_values={profile_image_url}
6. Return { profile_image_url }

Note: profile_image_url stored as MinIO path, not pre-signed URL.
Pre-signed URL generated on demand by GET /admin/students/:id or GET /student/profile.
```

#### `reinstateStudent(studentId, context)` — admin recovers a soft-deleted student

```
1. Fetch student WHERE id = $id AND institute_id = $ctx.instituteId AND is_deleted = TRUE
   → If not found (never existed or wrong institute): throw NotFoundException
2. BEGIN TRANSACTION:
   a. UPDATE students SET is_deleted=false, deleted_at=null, deleted_by=null
   b. UPDATE users    SET is_deleted=false, deleted_at=null, deleted_by=null,
                          is_active=true, must_change_password=true
      → must_change_password forced to true — student must reset password on next login
3. COMMIT
4. AuditLog: action=REINSTATE, resource_type=students, resource_id=student.id
5. Return reinstated student object

Note: Session is not restored — student must log in again with a new password.
Admin must share new credentials (no auto-generate here — admin resets via must_change_password flag).
```

**Endpoint:** `POST /admin/students/:id/reinstate` — add to controller table.

#### `getStudentPerformance(studentId, context)`

```
1. Fetch student WHERE id = $studentId AND institute_id = $ctx.instituteId AND is_deleted = false
2. SELECT submissions JOIN assessments ON submissions.assessment_id = assessments.id
   WHERE submissions.student_id = $studentId
     AND assessments.institute_id = $ctx.instituteId
     AND assessments.is_deleted = false
     AND submissions.status = 'evaluated'
     AND assessments.results_released = true  -- only show released results
   ORDER BY assessments.start_at DESC
3. Return list: [{ assessmentId, title, totalMarks, marksAwarded, date }]
```

---

### 1.3 Validation Rules

| Field | Rule |
|---|---|
| name | Required, VARCHAR(255), trimmed |
| email | Required, valid email format, globally unique in users |
| phone | Required, valid phone format (10 digits) |
| class | Required, VARCHAR(100), trimmed |
| school | Required, VARCHAR(255), trimmed |
| fee_amount | Required, positive number, max 2 decimal places |
| roll_number | Optional, unique per institute (partial unique index) |
| date_of_birth | Optional, valid DATE, not in future |
| parent_phone | Optional, valid phone format if provided |

---

### 1.4 Pagination Strategy

```
Default:  page=1, limit=20 (fixed — limit cannot be changed by client)
Sort:     join_date DESC (default)
Filters:  class (exact), school (exact) — both from dropdown; applied before pagination
Search:   GIN full-text on name/email/phone + ILIKE on class/school — applied before pagination
Response: { data: Student[], meta: { page, limit, total, totalPages } }
```

---

### 1.5 Soft Delete Enforcement

- `students.is_deleted = true` + `users.is_deleted = true` set together in a transaction
- Session invalidated immediately (`session_id = NULL`, `refresh_token_hash = NULL`)
- All queries filter `WHERE students.is_deleted = false`
- Deleted student's submissions and payments are NOT deleted
- Student cannot log in after soft delete — the session check fails before password check

---

### 1.6 Audit Log Triggers

| Action | Trigger |
|---|---|
| CREATE | After successful single student creation |
| BULK_UPLOAD | After bulk upload completes — logs count of created/skipped |
| UPDATE | After any field update — logs old_values and new_values |
| DELETE | After soft delete — logs student ID |
| EXPORT | After Excel export download |

---

### 1.7 Security Checks

- `institute_id` never from request body — always from `req.instituteId` (JWT-derived)
- Student cannot update their own email — endpoint level restriction
- Student cannot view other students — `/student/profile` returns own data only
- Profile photo upload validates MIME type (image/jpeg, image/png) + extension + max 5MB
- Bulk upload CSV of passwords: never persisted — returned in-memory once

---

---

## Module 2 — Study Materials

### 2.1 Controller Endpoints

| Method | Route | Role | Feature Required |
|---|---|---|---|
| GET | `/admin/materials` | admin | materials |
| POST | `/admin/materials` | admin | materials |
| PUT | `/admin/materials/:id` | admin | materials |
| PATCH | `/admin/materials/:id/hide` | admin | materials |
| PATCH | `/admin/materials/:id/unhide` | admin | materials |
| DELETE | `/admin/materials/:id` | admin | materials |
| GET | `/admin/materials/:id/view-url` | admin | materials |
| GET | `/student/materials` | student | materials |
| GET | `/student/materials/:id/view-url` | student | materials |

---

### 2.2 Service Flow

#### `listMaterials(query, context, role)`

```
1. Build base query:
   WHERE institute_id = $ctx.instituteId AND is_deleted = false
2. Role-based filter:
   - admin: include all (is_hidden = true AND is_hidden = false)
   - student: add AND is_hidden = false
3. Apply optional filters:
   - filter.subject → WHERE subject = $subject
4. Apply sort:
   - sort=newest (default) → ORDER BY created_at DESC
   - sort=oldest           → ORDER BY created_at ASC
5. Apply search (admin only):
   - search text → GIN full-text WHERE to_tsvector('english', title||' '||subject||' '||author)
                   @@ plainto_tsquery($search)
6. Paginate: LIMIT 20 OFFSET (page - 1) * 20
7. Return { data[], meta }
```

#### `uploadMaterial(file, dto, context)`

```
1. Validate file:
   - MIME type: must be application/pdf
   - Extension: must be .pdf
   - Size: max 50MB (52,428,800 bytes)
   → Reject immediately if any check fails
2. Generate material_id (UUID)
3. Upload file to MinIO:
   - Path: /{institute_id}/materials/{material_id}.pdf
   - Content-Type: application/pdf
4. INSERT INTO study_materials:
   (institute_id, title, subject, author, description, file_url=minio_path,
    file_name=original_name, file_type='pdf', file_size_bytes, uploaded_by)
5. AuditLog: action=CREATE, resource_type=materials, resource_id=material.id
6. Return material record (without pre-signed URL — URL generated on demand)
```

#### `updateMaterial(id, dto, file?, context)`

```
1. Fetch material WHERE id AND institute_id AND is_deleted = false
2. Capture old_values
3. If file provided (admin replacing PDF):
   a. Validate new file (MIME, extension, size — same as upload)
   b. Overwrite at SAME MinIO path: /{institute_id}/materials/{material.id}.pdf
      → Old file is overwritten. Pre-signed URLs for old file remain valid up to 15 min.
4. UPDATE study_materials SET (title, subject, author, description, file_name, file_size_bytes)
5. AuditLog: action=UPDATE, resource_type=materials, old_values, new_values
6. Return updated material
```

#### `hideMaterial(id, context)` / `unhideMaterial(id, context)`

```
1. Fetch material WHERE id AND institute_id AND is_deleted = false
2. UPDATE study_materials SET is_hidden = true/false
3. AuditLog: action=HIDE/UNHIDE, resource_type=materials, resource_id
4. Return updated material
```

**Mid-session hide rule:** Already-opened documents remain accessible until student navigates away. Next request for view-url will return 404 for hidden materials (student route adds `AND is_hidden = false`).

#### `getViewUrl(id, context, role)`

```
1. Fetch material:
   - admin: WHERE id AND institute_id AND is_deleted = false
   - student: WHERE id AND institute_id AND is_deleted = false AND is_hidden = false
   → If not found: throw NotFoundException (student gets same error for hidden — no info leak)
2. Generate MinIO pre-signed URL:
   - Path: /{institute_id}/materials/{material.id}.pdf
   - Expiry: 15 minutes
   - Method: GET
3. Return { url, expiresAt }
   → Frontend PDF.js viewer uses this URL directly
   → URL expires — cannot be shared or bookmarked
```

#### `softDeleteMaterial(id, context)`

```
1. Fetch material WHERE id AND institute_id AND is_deleted = false
2. UPDATE study_materials SET is_deleted=true, deleted_at=now(), deleted_by=$ctx.userId
3. AuditLog: action=DELETE, resource_type=materials, resource_id
4. Return { success: true }
```

---

### 2.3 Validation Rules

| Field | Rule |
|---|---|
| title | Required, VARCHAR(255) |
| subject | Required, VARCHAR(100) |
| author | Optional, VARCHAR(255) |
| description | Optional, TEXT |
| file | Required on create; optional on update (only if replacing PDF) |
| file MIME | Must be `application/pdf` |
| file extension | Must be `.pdf` |
| file size | Max 50MB |

---

### 2.4 Pagination Strategy

```
Default:  page=1, limit=20 (fixed)
Sort:     created_at DESC (newest, default) or created_at ASC (oldest)
Filter:   subject (exact match, dropdown)
Search:   admin-only GIN full-text on (title, subject, author)
```

---

### 2.5 Soft Delete Enforcement

- `is_deleted = true` hides from both admin and student queries
- `is_hidden = true` hides from students only — admin still sees with "Hidden" badge
- Both flags checked independently: `is_deleted = false` is always applied; `is_hidden = false` is applied for students only
- MinIO file is NOT deleted when material is soft-deleted (file retained for data recovery)

---

### 2.6 Audit Log Triggers

| Action | Trigger |
|---|---|
| CREATE | After successful upload |
| UPDATE | After metadata or file replacement |
| HIDE | After `is_hidden = true` |
| UNHIDE | After `is_hidden = false` |
| DELETE | After soft delete |
| VIEW_URL | Not logged (read-only operation) |

---

### 2.7 Security Checks

- File MIME type + extension both validated (double check — prevents content-type spoofing)
- Pre-signed URLs expire in 15 minutes — cannot be shared
- Student route adds `AND is_hidden = false` — hidden materials 404 for students
- Watermark is applied by the frontend viewer component (student name from JWT)
- `institute_id` from JWT — students can only request URLs for their institute's materials
- Admin can only manage materials in their own institute

---

---

## Module 3 — Assessments

### 3.1 Controller Endpoints

| Method | Route | Role | Feature Required |
|---|---|---|---|
| GET | `/admin/assessments` | admin | assessments |
| GET | `/admin/assessments/:id` | admin | assessments |
| POST | `/admin/assessments` | admin | assessments |
| PUT | `/admin/assessments/:id` | admin | assessments |
| POST | `/admin/assessments/:id/publish` | admin | assessments |
| POST | `/admin/assessments/:id/duplicate` | admin | assessments |
| DELETE | `/admin/assessments/:id` | admin | assessments |
| POST | `/admin/assessments/:id/questions` | admin | assessments |
| POST | `/admin/assessments/:id/questions/bulk` | admin | assessments |
| PUT | `/admin/assessments/:id/questions/:qid` | admin | assessments |
| DELETE | `/admin/assessments/:id/questions/:qid` | admin | assessments |
| POST | `/admin/assessments/:id/questions/:qid/image` | admin | assessments |
| POST | `/admin/assessments/:id/ai-generate` | admin | assessments + ai_generation |
| GET | `/admin/assessments/:id/submissions` | admin | assessments |
| GET | `/admin/assessments/:id/submissions/:sid` | admin | assessments |
| PUT | `/admin/assessments/:id/submissions/:sid/evaluate` | admin | assessments |
| POST | `/admin/assessments/:id/submissions/:sid/finalise` | admin | assessments |
| POST | `/admin/assessments/:id/submissions/:sid/flag` | admin | assessments |
| POST | `/admin/assessments/:id/release-results` | admin | assessments |
| GET | `/admin/assessments/:id/stats` | admin | assessments |
| GET | `/student/assessments` | student | assessments |
| GET | `/student/assessments/:id` | student | assessments |
| POST | `/student/assessments/:id/start` | student | assessments |
| PUT | `/student/assessments/:id/answers` | student | assessments |
| POST | `/student/assessments/:id/submit` | student | assessments |
| POST | `/student/assessments/:id/upload` | student | assessments |
| GET | `/student/assessments/:id/results` | student | assessments |

---

### 3.2 Assessment Status Machine

```
DRAFT
  │
  │  Admin clicks "Publish"
  │  Validation: start_at NOT NULL, end_at NOT NULL, question_count >= 1
  ▼
PUBLISHED  ←── Students see the card (locked, unclickable)
  │
  │  Scheduled job: checks every minute
  │  Condition: now() >= start_at
  ▼
ACTIVE  ←── Students can click the card and submit answers
  │
  │  Scheduled job: checks every minute
  │  Condition: now() >= end_at
  │  Side effect: auto-submits all open (pending) submissions
  ▼
CLOSED  ←── No more submissions. MCQ typed answers auto-evaluated.
  │
  │  Admin completes evaluation and clicks "Mark as Evaluated"
  ▼
EVALUATED  ←── Marks are final (but still editable)

results_released boolean → separate from status — admin controls per-student visibility
```

**Status transition service: `AssessmentStatusCronService`**

```
Runs every 60 seconds:
1. Find all PUBLISHED assessments WHERE start_at <= now() AND status = 'published'
   → Transition to ACTIVE
   → Emit event: assessment.activated

2. Find all ACTIVE assessments WHERE end_at <= now() AND status = 'active'
   → Transition to CLOSED
   → Auto-submit all pending submissions (see autoSubmit below)
   → Evaluate MCQ typed answers (see mcqAutoEvaluate below)
   → Emit event: assessment.closed
```

---

### 3.3 Service Flow

#### `createAssessment(dto, context)`

```
1. INSERT INTO assessments:
   (institute_id, title, subjects, type, total_marks=0,
    start_at=null, end_at=null, status='draft',
    instructions, negative_marking_enabled=false,
    negative_marking_value=0, results_released=false, created_by)
   → start_at and end_at are NULL at creation — set later before publishing
2. AuditLog: action=CREATE, resource_type=assessments
3. Return assessment
```

#### `publishAssessment(id, context)`

```
1. Fetch assessment WHERE id AND institute_id AND is_deleted = false
2. Check status = 'draft'
   → If not draft: throw BadRequestException('Only draft assessments can be published')
3. Validate publish conditions:
   a. start_at IS NOT NULL → else throw 'Start time is required before publishing'
   b. end_at IS NOT NULL   → else throw 'End time is required before publishing'
   c. end_at > start_at    → else throw 'End time must be after start time'
   d. SELECT COUNT(*) FROM assessment_questions WHERE assessment_id = $id
      → If count = 0: throw 'Add at least one question before publishing'
   e. Validate total_marks = SUM(question.marks) → else throw marks mismatch error
4. If start_at is already in the past:
   → status = 'active' (direct transition — assessment starts immediately)
   Else:
   → status = 'published'
5. UPDATE assessments SET status, updated_at
6. AuditLog: action=UPDATE, resource_type=assessments, new_values={status: 'published'}
7. Return assessment
```

#### `addQuestion(assessmentId, dto, context)`

```
1. Fetch assessment (any status — admin can add questions at any status)
2. Validate:
   a. question_text is not empty
   b. type is 'mcq' or 'descriptive'
   c. marks > 0
   d. difficulty is 'easy', 'medium', or 'hard'
   e. If type = 'mcq':
      - options must have exactly 4 items
      - each option must have label in ['A','B','C','D'] and non-empty text
      - options must NOT contain is_correct field (removed from schema — use correct_option only)
      - correct_option must be provided and must be one of: 'A', 'B', 'C', 'D'
   f. Total questions count < 100
      → If count = 100: throw 'Maximum 100 questions per assessment'
3. Recalculate and UPDATE assessments.total_marks += dto.marks
4. INSERT INTO assessment_questions
5. Determine order_index = current max + 1
6. AuditLog: action=CREATE, resource_type=assessment_questions
7. Return question
```

#### `editQuestion(assessmentId, questionId, dto, context)`

```
1. Fetch question WHERE id AND assessment_id AND institute_id
2. Capture old marks value
3. Validate updated fields (same rules as addQuestion)
4. If marks changed:
   - marks_delta = new_marks - old_marks
   - UPDATE assessments.total_marks += marks_delta
5. UPDATE assessment_questions
6. AuditLog: action=UPDATE, resource_type=assessment_questions, old_values, new_values
```

#### `deleteQuestion(assessmentId, questionId, context)`

```
1. Fetch assessment WHERE id AND institute_id AND is_deleted = false
2. Check assessment.status = 'draft'
   → If status != 'draft': throw BadRequestException(
       'Questions cannot be deleted after publishing. Duplicate the assessment to restructure it.')
3. Fetch question WHERE id AND assessment_id
4. BEGIN TRANSACTION:
   a. UPDATE assessments SET total_marks -= question.marks
   b. DELETE FROM assessment_questions WHERE id = $questionId
      (Hard delete — questions are not soft-deleted)
5. COMMIT
6. AuditLog: action=DELETE, resource_type=assessment_questions
```

#### `bulkAddQuestions(assessmentId, questionsDto, context)` — saves AI-reviewed questions

```
questionsDto: { questions: QuestionDto[] }

1. Fetch assessment WHERE id AND institute_id AND is_deleted = false
2. Validate assessment.status = 'draft'
   → If not draft: throw 'Questions can only be added to draft assessments'
3. Validate each question (same rules as addQuestion step 2)
4. Check total count: existing_count + questions.length <= 100
5. BEGIN TRANSACTION:
   a. INSERT all questions in batch
   b. UPDATE assessments.total_marks += SUM(all new question marks)
6. COMMIT
7. AuditLog: action=CREATE, resource_type=assessment_questions,
             new_values={ count: questions.length }
8. Return { created: count, assessment_total_marks: updated_total }
```

**Question status rule (applies to addQuestion, editQuestion, deleteQuestion, bulkAddQuestions):**
```
DRAFT:      Add / Edit / Delete allowed
PUBLISHED:  Add / Edit allowed. Delete BLOCKED.
ACTIVE:     Add / Edit allowed. Delete BLOCKED.
            (Edge case: admin adds a question mid-exam. Student refreshes and sees the new question.
            This is by design — admin has full control. Frontend warns before saving.)
CLOSED:     All question modifications BLOCKED (submissions already captured)
EVALUATED:  All question modifications BLOCKED
```

#### `duplicateAssessment(id, context)`

```
1. Fetch assessment with all its questions
2. INSERT new assessment row:
   - title = original.title + ' (Copy)'
   - Same: subjects, type, total_marks, instructions,
           negative_marking_enabled, negative_marking_value
   - Reset: start_at=null, end_at=null, status='draft',
            results_released=false, ai_generated=false
3. INSERT all questions for the new assessment (same question data, new IDs)
4. AuditLog: action=CREATE, resource_type=assessments, new_values={duplicated_from: id}
5. Return new assessment
```

---

### 3.4 MCQ Logic

#### `mcqAutoEvaluate(assessmentId)` — called when assessment transitions to CLOSED

```
1. Fetch all assessment_questions WHERE type = 'mcq' AND assessment_id = $id
   Build map: { [question_id]: correct_option }

2. Fetch all submissions WHERE assessment_id = $id AND status = 'submitted'

3. For each submission:
   For each answer in submission.answers where type = 'mcq':
     a. Lookup correct_option from map
     b. If answer.selected_option = correct_option:
          answer.is_correct = true
          answer.marks_awarded = question.marks
     c. Else if answer.selected_option IS NULL (unattempted):
          answer.is_correct = false
          answer.marks_awarded = 0
     d. Else (wrong answer):
          answer.is_correct = false
          If negative_marking_enabled:
            answer.marks_awarded = -(negative_marking_value)
            (applied to total, but total cannot go below 0)
          Else:
            answer.marks_awarded = 0

4. UPDATE submissions SET
     answers = updated_answers_jsonb,
     evaluation_type = 'auto'   ← mark as system-evaluated
   WHERE assessment_id = $id AND status = 'submitted'

5. Note: Typed MCQ answers are now read-only for admin during evaluation.
         Only MCQ answers from upload_files remain manually evaluated via ✓/✗ toggle.
```

**Negative marking total cap:**
```
total_marks_awarded = MAX(0, SUM(all marks_awarded))
```

---

### 3.5 Student Submission Flow

#### `startAssessment(assessmentId, context)` — student clicks "Start Exam"

```
1. Fetch assessment WHERE id AND institute_id AND is_deleted = false AND status = 'active'
   → If status = 'published': throw 403 'Exam has not started yet'
   → If status = 'closed/evaluated': throw 403 'Exam is closed'
2. Check if submission already exists for (assessment_id, student_id):
   → If exists AND status = 'submitted': throw 403 'Already submitted'
   → If exists AND status = 'pending': return existing submission (resume)
   → If not exists: INSERT INTO submissions (status='pending', answers=[], upload_files=[])
3. Return submission + all assessment questions (full question data for the exam UI)
```

#### `autoSaveAnswers(assessmentId, answersDto, context)` — triggered every 60 seconds

```
1. Fetch submission WHERE assessment_id AND student_id AND status = 'pending'
   → If not found or status != 'pending': throw 403 'Cannot save — exam is closed or not started'
2. Check assessment still ACTIVE:
   → Fetch assessment. If status != 'active': stop saving (exam closed)
3. Validate answers array:
   - Each answer references a valid question_id in this assessment
   - MCQ: selected_option must be A, B, C, or D (or null for unattempted)
   - Descriptive: answer_text is text or null
4. MERGE incoming answers with existing:
   → Replace answers for question_ids present in dto
   → Keep existing answers for question_ids NOT in dto
5. UPDATE submissions.answers = merged_answers
6. Return { saved: true, savedAt: now() }
```

#### `submitAssessment(assessmentId, context)` — student clicks "Submit"

```
1. Fetch submission WHERE assessment_id AND student_id AND status = 'pending'
2. Fetch assessment to check status = 'active'
   → If closed: auto-submit flow (see autoSubmitOnClose)
3. UPDATE submissions SET status='submitted', submitted_at=now()
4. Return { submitted: true }
```

#### `autoSubmitOnClose(assessmentId)` — called when assessment transitions to CLOSED

```
1. Find all submissions WHERE assessment_id AND status = 'pending'
2. For each: UPDATE status='submitted', submitted_at=end_at
3. Find all students enrolled (who have a submission record in 'pending' status)
   → Create submission records for students who NEVER opened the exam:
     INSERT INTO submissions (assessment_id, student_id, status='submitted',
                               answers=[], upload_files=[], is_absent=true,
                               submitted_at=end_at, total_marks_awarded=0)
   → These absent students get total_marks_awarded=0 automatically
```

**How absent students are detected:**
```
Students with no submission record at close time have never even started the exam.
The cron fetches all students for the institute:
  SELECT s.id FROM students WHERE institute_id = $id AND is_deleted = false
Then finds students with no submission row for this assessment.
Creates absent submission records for them.
```

#### `uploadAnswerFiles(assessmentId, files, context)` — student uploads answer sheet

```
1. Fetch submission WHERE assessment_id AND student_id AND status = 'pending'
2. Fetch assessment — must be ACTIVE
3. Validate each file:
   - MIME type: image/jpeg, image/png, application/pdf
   - Extension: .jpg, .jpeg, .png, .pdf
   - Total size of all files (existing + new) <= 20MB
4. For each file:
   Upload to MinIO at /{institute_id}/submissions/{submission_id}/{filename}
5. Append to submission.upload_files:
   [{ url: minio_path, file_name, file_type, size_bytes }]
6. UPDATE submissions.upload_files = updated_array
7. Return updated upload_files list
```

---

### 3.6 Evaluation Workflow

#### `getEvaluationList(assessmentId, context)`

```
1. Fetch all submissions for assessment WHERE institute_id = $ctx.instituteId
2. JOIN students + users to get student name
3. For each submission, compute:
   - evaluation_status: 'absent' (is_absent=true) | 'evaluated' (evaluated_at not null) | 'pending'
   - has_typed_answers: answers.length > 0
   - has_uploads: upload_files.length > 0
   - flag_for_review
4. Return list with progress: { evaluated: N, total: M, students: [...] }
```

#### `getSubmissionForEvaluation(assessmentId, submissionId, context)`

```
1. Fetch submission with full answers and upload_files
2. Fetch all questions for the assessment (ordered by order_index)
3. Generate pre-signed URLs for all items in upload_files (15-min expiry each)
4. Return:
   - Left panel data: questions list with current marks_awarded values
   - Right panel data: typed answers + pre-signed file URLs
   - is_absent flag
   - flag_for_review flag
```

#### `evaluateSubmission(assessmentId, submissionId, evaluationDto, context)`

```
evaluationDto: {
  answers: [{ question_id, marks_awarded, feedback }],
  total_override?: number  // used in Quick Mode
}

1. Fetch submission — must belong to this institute and assessment
2. If submission.is_absent = true: throw 'Cannot evaluate absent student submission'
3. Validate each answer in dto:
   - question_id must exist in this assessment
   - marks_awarded must be 0 <= value <= question.marks (cannot award more than question max)
   - MCQ typed answers (where is_correct is already set): marks_awarded cannot be modified
     → For typed MCQ: skip silently (auto-evaluated value preserved)
   - MCQ upload answers (toggles): marks_awarded calculated from ✓/✗ toggle
     → ✓ toggle: marks_awarded = question.marks
     → ✗ toggle: marks_awarded = -(negative_marking_value) if neg enabled, else 0
4. If total_override provided (Quick Mode):
   - total_marks_awarded = MAX(0, total_override)
   - Marks per question remain blank/as-is
5. Else:
   - Merge incoming answer evaluations into submission.answers
   - Auto-save (marks saved without finalising)
6. UPDATE submissions.answers, evaluated_by, evaluated_at=now()
7. AuditLog: action=EVALUATE, resource_type=submissions
8. Return updated submission with running_total
```

#### `finaliseEvaluation(assessmentId, submissionId, context)`

```
1. Fetch submission
2. Check for unanswered descriptive questions:
   - Questions with type='descriptive' where marks_awarded is null
   - Build warning list: [{ question_id, question_text }]
   - Return warning if any unfilled (frontend shows warning dialog)
   - Admin can dismiss and finalise anyway OR go back and fill
3. Calculate total_marks_awarded:
   total = SUM of all answer.marks_awarded (including auto-evaluated MCQ marks)
   total = MAX(0, total)  ← cap at 0, never negative
4. UPDATE submissions SET
     total_marks_awarded = total,
     evaluated_at = now(),
     evaluation_type = 'manual',    ← mark as admin-evaluated
     evaluated_by = $ctx.userId
5. AuditLog: action=FINALISE_EVALUATION
6. Return { total_marks_awarded, warning_questions }
```

**Auto-recalculate after edit:**
```
If admin edits any marks after finalising:
  UPDATE submissions.answers (the changed answer)
  Immediately recalculate total_marks_awarded = MAX(0, SUM(all marks_awarded))
  UPDATE submissions.total_marks_awarded
  → No need to click Finalise again
```

#### `flagSubmissionForReview(submissionId, context)` / `unflagSubmission`

```
UPDATE submissions SET flag_for_review = true/false
AuditLog: action=FLAG/UNFLAG, resource_type=submissions
```

---

### 3.7 Result Publishing Workflow

#### `releaseResults(assessmentId, dto, context)`

```
dto: { mode: 'all' | 'individual', studentId?: UUID }

1. Fetch assessment WHERE id AND institute_id AND is_deleted = false
2. If mode = 'individual':
   - Fetch submission WHERE assessment_id AND student_id = dto.studentId
   - UPDATE submissions SET results_released_at = now()
3. If mode = 'all':
   - UPDATE assessments SET results_released = true
   - UPDATE submissions SET results_released_at = now()
     WHERE assessment_id = $id AND results_released_at IS NULL
4. AuditLog: action=RELEASE_RESULTS, resource_type=assessments
5. Return { released: true }
```

**After release — marks remain editable:**
```
If admin edits marks after releasing:
- total_marks_awarded recalculates immediately
- Student sees updated marks on next page load (no re-release needed)
- results_released stays true — there is no "un-release" workflow in V1
```

#### `getStudentResults(assessmentId, context)` — student endpoint

```
1. Fetch assessment WHERE id AND institute_id AND status != 'draft' AND is_deleted = false
2. Fetch submission WHERE assessment_id AND student_id = $ctx.studentId
3. Check results visibility:
   - If assessments.results_released = false AND submissions.results_released_at IS NULL:
     → throw 403 'Results have not been released yet'
4. Return:
   - Per-question marks: [{ question_id, question_text, marks, marks_awarded, feedback }]
   - total_marks_awarded
   - assessment.total_marks
   - submitted_at
```

---

### 3.8 AI Question Generation Flow

#### `generateQuestions(assessmentId, dto, context)` — requires BOTH assessments + ai_generation features

```
dto: {
  subject: string,
  topic: string,
  count: number (1–20),
  type: 'mcq' | 'descriptive',
  difficulty: 'easy' | 'medium' | 'hard'
}

1. Validate dto
2. Check question count: current_count + dto.count <= 100
   → If would exceed 100: throw 'Would exceed 100 question limit'
3. Call AiService.generateQuestions(dto):
   a. Build prompt for OpenAI:
      "Generate {count} {difficulty} {type} questions about {topic} in {subject}.
       For MCQ: provide exactly 4 options A, B, C, D with exactly one correct answer.
       Return JSON array."
   b. Call OpenAI API (gpt-3.5-turbo or configured model)
   c. Parse response JSON
   d. If API call fails or response malformed:
      → throw ServiceUnavailableException({ message: 'AI generation failed', fallback: 'manual' })
      → Frontend shows error and allows manual entry — no partial save
4. Validate AI response:
   - Each question has question_text, type, marks, difficulty, options (if MCQ), correct_option (if MCQ)
   - MCQ: exactly 4 options with labels A/B/C/D, one is_correct=true
5. Return generated questions as PREVIEW (not saved yet):
   { questions: GeneratedQuestion[], requiresReview: true }

→ Admin reviews, edits, and clicks "Add to Assessment"
→ Separate endpoint: POST /admin/assessments/:id/questions/bulk (saves reviewed questions)
→ Admin can delete, edit, or add more questions to the AI-generated set before saving
→ Admin can also mix AI questions with manually written questions
```

**Fallback behaviour:**
```
AI generation is optional. If OpenAI API:
- Times out (>30s): return error, frontend shows "Try again or add manually"
- Returns invalid JSON: return error
- Rate limited: return error
In all cases, the assessment creation is NOT blocked. Manual entry always works.
```

---

### 3.9 Time Lock Mechanism

**Student side (frontend enforced + backend verified):**

```
Assessment card states:

status = 'draft':
  → Not visible to students at all

status = 'published':
  → Visible on card with start/end time displayed
  → Card is UNCLICKABLE (cursor: not-allowed)
  → Backend: POST /student/assessments/:id/start → 403 if status = 'published'

status = 'active':
  → Card is clickable
  → Shows instructions screen: title, instructions, total marks, start_at, end_at (IST)
  → "Start Exam" button — questions shown only after clicking
  → Backend: creates/returns submission row

status = 'closed' or 'evaluated':
  → Card is unclickable
  → Shows "Exam Ended" state
  → Backend: POST /student/assessments/:id/start → 403
```

**Auto-submit at `end_at`:**
```
The AssessmentStatusCronService (runs every 60 seconds) detects end_at <= now().
It transitions status to 'closed' and calls autoSubmitOnClose().
Any student mid-exam at that moment:
  - Their in-progress (pending) submission is force-submitted
  - submitted_at = end_at (not the actual moment — stamped as end_at)
  - Any answers already auto-saved (every 60s) are captured
```

---

### 3.10 Validation Rules

| Rule | Details |
|---|---|
| MCQ options | Exactly 4 options, labels A/B/C/D, exactly one correct |
| Question marks | Must be > 0 integer |
| Total marks | Must equal SUM(all question marks) at publish time |
| Question count | Max 100 per assessment |
| Publish conditions | start_at NOT NULL, end_at NOT NULL, question count >= 1 |
| start_at vs end_at | end_at must be > start_at |
| Answer save | Only allowed when assessment status = 'active' and submission status = 'pending' |
| File uploads | JPG/PNG/PDF only, total <= 20MB |
| marks_awarded | 0 to question.marks (admin); negative only via ✗ toggle when neg marking enabled |
| total_marks_awarded | Capped at 0 — never negative |

---

### 3.11 Pagination Strategy

```
List assessments:  page=1, limit=20, sort=created_at DESC
  - Admin sees all statuses
  - Student sees: published, active, closed, evaluated (not draft)

List submissions:  page=1, limit=20, sort=student_name ASC
  - Filter: evaluated | pending | absent
```

---

### 3.12 Audit Log Triggers

| Action | Trigger |
|---|---|
| CREATE | Assessment created |
| UPDATE | Assessment metadata or questions edited |
| PUBLISH | Status changed to published/active |
| EVALUATE | Marks saved for a submission |
| FINALISE_EVALUATION | Total marks calculated |
| RELEASE_RESULTS | Results released (individual or all) |
| DELETE | Assessment soft-deleted |
| FLAG/UNFLAG | Submission flagged/unflagged for review |
| OVERDUE (auto) | Auto-overdue transitions in payment module |

---

### 3.13 Assessment Stats

#### `getAssessmentStats(assessmentId, context)` — shown after finalisation

```
1. Fetch all evaluated submissions WHERE assessment_id AND is_absent = false
2. Compute:
   - highest_score = MAX(total_marks_awarded)
   - lowest_score  = MIN(total_marks_awarded)
   - average_score = AVG(total_marks_awarded) rounded to 2 decimal places
   - total_evaluated = COUNT(*) WHERE evaluated_at IS NOT NULL
   - total_absent = COUNT(*) WHERE is_absent = true
   - total_students = total_evaluated + total_absent + pending_count
3. Stats update automatically — this is a live query, not a cached snapshot
4. Return stats object
```

---

---

## Module 4 — Payments

### 4.1 Controller Endpoints

| Method | Route | Role | Feature Required |
|---|---|---|---|
| GET | `/admin/payments` | admin | payments |
| GET | `/admin/payments/overdue` | admin | payments |
| GET | `/admin/payments/export` | admin | payments |
| GET | `/admin/payments/student/:studentId` | admin | payments |
| PUT | `/admin/payments/:id/status` | admin | payments |
| POST | `/admin/payments/bulk-update` | admin | payments |
| PUT | `/admin/students/:id/fee` | admin | payments |
| POST | `/admin/payments/class-fee` | admin | payments |

---

### 4.2 Service Flow

#### `listPayments(query, context)`

```
1. Base query:
   SELECT payments.*, students.class, users.name
   FROM payments
   JOIN students ON payments.student_id = students.id
   JOIN users ON students.user_id = users.id
   WHERE payments.institute_id = $ctx.instituteId
     AND payments.is_deleted = false
     AND students.is_deleted = false (exclude permanently-deleted-students with all-paid records)
     + Special rule: include deleted students IF status IN ('pending', 'overdue')

2. Apply filters:
   - filter.month   → WHERE month = $month (exact date e.g. 2025-03-01)
   - filter.status  → WHERE status = $status
   - filter.class   → WHERE students.class = $class

3. Sort: month DESC (default), then student name ASC
4. Paginate: LIMIT 20 OFFSET (page - 1) * 20
5. Return { data[], meta }
```

**Deleted student payment visibility rule:**
```sql
WHERE payments.is_deleted = false
  AND (
    students.is_deleted = false    -- active students always shown
    OR (
      students.is_deleted = true   -- deleted students only shown if payment not fully paid
      AND payments.status IN ('pending', 'overdue')
    )
  )
```

#### `getOverduePayments(query, context)`

```
Dedicated tab — shows all overdue records across ALL months:
WHERE institute_id = $ctx.instituteId
  AND status = 'overdue'
  AND is_deleted = false
ORDER BY month DESC, student name ASC
(No month filter — overdue tab shows all months)
```

#### `updatePaymentStatus(paymentId, dto, context)`

```
dto: { status: 'pending' | 'paid' | 'overdue', reference?: string, notes?: string }

1. Fetch payment WHERE id AND institute_id AND is_deleted = false
2. Validate status transition (all transitions allowed by admin)
3. Capture old_values
4. UPDATE payments SET status = dto.status,
                       reference = dto.reference,
                       notes = dto.notes,
                       paid_at = (if status='paid' then now() else null),
                       updated_by = $ctx.userId
5. AuditLog: action=UPDATE, resource_type=payments, old_values, new_values
6. Return updated payment
```

#### `bulkUpdatePaymentStatus(dto, context)`

```
dto: { paymentIds: UUID[], status: string, notes?: string }

1. Validate paymentIds are all in same institute: WHERE id IN ($ids) AND institute_id = $ctx.instituteId
2. BEGIN TRANSACTION:
   UPDATE payments SET status, paid_at (if paid), notes, updated_by
   WHERE id IN ($ids) AND institute_id = $ctx.instituteId AND is_deleted = false
3. COMMIT
4. AuditLog one entry per payment: action=UPDATE (bulk)
5. Return { updated: count }
```

#### `getStudentPaymentHistory(studentId, context)`

```
Fetches last 10 months for modal:
SELECT * FROM payments
WHERE student_id = $studentId
  AND institute_id = $ctx.instituteId
  AND month >= date_trunc('month', now()) - interval '9 months'
  AND is_deleted = false
ORDER BY month DESC
```

#### `updateStudentFeeAmount(studentId, dto, context)`

```
dto: { fee_amount: number }

1. Fetch student WHERE id AND institute_id AND is_deleted = false
2. Validate fee_amount > 0
3. UPDATE students SET fee_amount = dto.fee_amount
4. AuditLog: action=UPDATE, resource_type=students, old_values={fee_amount}, new_values={fee_amount}

Note: This change applies from NEXT month's payment record.
Current month and all past payment records are NOT changed.
The payment amount is a snapshot taken at record creation time.
```

#### `updateClassFeeAmount(dto, context)`

```
dto: { class: string, fee_amount: number }

1. Validate fee_amount > 0
2. UPDATE students SET fee_amount = dto.fee_amount
   WHERE institute_id = $ctx.instituteId
     AND class = dto.class
     AND is_deleted = false
3. Count of updated students returned
4. AuditLog: action=UPDATE, resource_type=students, new_values={class, fee_amount}

Note: Same rule — applies from next month. Past records unchanged.
```

#### `exportPayments(query, context)`

```
1. Apply same filters as listPayments but NO pagination — fetch all matching records
2. Build Excel using ExcelTemplateService:
   Columns: Student Name, Roll Number, Class, Month, Amount (₹), Status, Reference, Paid At, Notes
3. Return Excel file as buffer
4. AuditLog: action=EXPORT, resource_type=payments
```

---

### 4.3 Payment Auto-Generation Cron Jobs

#### `PaymentAutoGenerateCronService` — runs on 1st of every month at 00:01 IST

```
@Cron('1 0 * * *')  // daily — checks if it's the 1st of the month
                     // OR @Cron('1 0 1 * *') for 1st of month only

1. Calculate current_month = date_trunc('month', now())
2. Fetch all active students:
   SELECT s.id, s.fee_amount, s.institute_id
   FROM students s
   WHERE s.is_deleted = false

3. For each student:
   a. Check if payment record already exists:
      SELECT id FROM payments WHERE student_id = $s.id AND month = $current_month
   b. If not exists:
      INSERT INTO payments (institute_id, student_id, month, amount=s.fee_amount, status='pending')
   c. If already exists: skip (idempotent — safe to re-run)

4. Log total records created to audit_logs with action=AUTO_GENERATE_PAYMENTS
```

**New student immediate payment (called from StudentsService.createStudent):**
```
After inserting student, immediately:
INSERT INTO payments (institute_id, student_id, month=first_day_of_current_month,
                      amount=student.fee_amount, status='pending')
WHERE NOT EXISTS (SELECT 1 FROM payments WHERE student_id=$id AND month=$current_month)
```

#### `PaymentAutoOverdueCronService` — runs daily at 00:01 IST

```
@Cron('1 0 * * *')

1. Calculate grace_cutoff = date_trunc('month', now()) - interval '5 days'
   Example: Running on Feb 10 → grace_cutoff = Jan 27 (5 days after Jan ended = Feb 5)
   More precisely: overdue if month_end + 5 days < today
   month_end = date_trunc('month', month) + interval '1 month' - interval '1 day'
   overdue if (month_end + interval '5 days') < now()

2. Find payments to transition:
   SELECT id FROM payments
   WHERE status = 'pending'
     AND is_deleted = false
     AND (
       date_trunc('month', month) + interval '1 month' - interval '1 day'
       + interval '5 days'
     ) < date_trunc('day', now())

   → Only 'pending' — never touches 'paid' or 'overdue'

3. UPDATE payments SET status = 'overdue'
   WHERE id IN ($ids)

4. Audit log: action=AUTO_OVERDUE, resource_type=payments,
              new_values={ count, month_range }

Cron safety rules:
- Never modifies paid records
- Never modifies already-overdue records
- Overdue is sticky — once set, never auto-reset
- Only admin can change overdue → paid
```

---

### 4.4 Validation Rules

| Rule | Details |
|---|---|
| fee_amount | Must be > 0, up to 2 decimal places |
| status transitions | All allowed by admin: pending ↔ paid ↔ overdue |
| bulk update | All payment IDs must belong to same institute |
| Export filters | At least one filter recommended but not required |
| Cron idempotency | INSERT payment only if not already exists for that month |

---

### 4.5 Pagination Strategy

```
Default:  page=1, limit=20
Sort:     month DESC + student name ASC (default)
Filters:  month, status, class — applied before pagination
Overdue tab: no month filter (all-time overdue), no pagination limit
Export:   no pagination — all matching records
```

---

### 4.6 Audit Log Triggers

| Action | Trigger |
|---|---|
| AUTO_GENERATE_PAYMENTS | Monthly cron completes |
| AUTO_OVERDUE | Daily cron marks records as overdue |
| UPDATE | Admin changes status or notes |
| BULK_UPDATE | Admin bulk-changes status |
| FEE_CHANGE | Admin changes fee_amount for a student or class |
| EXPORT | Admin downloads Excel |

---

### 4.7 Security Checks

- Admin can only manage payments for their own institute
- `institute_id` from JWT — never from body
- Cron job validates `institute_id` for each student before creating records
- Export is audit-logged to track data access

---

---

## Module 5 — Notifications

### 5.1 Controller Endpoints

| Method | Route | Role | Feature Required |
|---|---|---|---|
| GET | `/admin/notifications` | admin | — |
| POST | `/admin/notifications` | admin | — |
| DELETE | `/admin/notifications/:id` | admin | — |
| GET | `/admin/notifications/unread-count` | admin | — |
| GET | `/student/notifications` | student | — |
| PATCH | `/student/notifications/:id/read` | student | — |
| PATCH | `/student/notifications/read-all` | student | — |
| DELETE | `/student/notifications/:id` | student | — |
| GET | `/student/notifications/unread-count` | student | — |

**Note:** Notifications do not require any feature to be enabled — they are a core system feature always available.

---

### 5.2 Service Flow

#### `createNotification(dto, context)` — admin sends notification

```
dto: {
  title: string (max 100 chars),
  body: string (max 500 chars),
  type: 'general' | 'payment_reminder' | 'assessment_reminder',
  target: 'all' | 'specific' | 'pending_overdue',
  studentIds?: UUID[]  // required if target = 'specific'
}

1. Validate:
   a. title.length <= 100
   b. body.length <= 500
   c. type is valid enum value
   d. If target = 'specific': studentIds must be non-empty array
   e. If target = 'pending_overdue': only allowed when type = 'payment_reminder'

2. Resolve recipient list based on target:

   target = 'all':
     SELECT id FROM students WHERE institute_id = $ctx.instituteId AND is_deleted = false

   target = 'specific':
     Validate all studentIds belong to this institute:
       SELECT id FROM students WHERE id IN ($ids) AND institute_id = $ctx.instituteId AND is_deleted = false
     Use validated ids only

   target = 'pending_overdue':
     SELECT DISTINCT s.id FROM students s
     JOIN payments p ON p.student_id = s.id
     WHERE p.institute_id = $ctx.instituteId
       AND p.status IN ('pending', 'overdue')
       AND p.is_deleted = false
       AND s.is_deleted = false

3. BEGIN TRANSACTION:
   a. INSERT INTO notifications (institute_id, title, body, type, target, sent_by)
   b. INSERT INTO notification_recipients for each recipient:
      (institute_id, notification_id, student_id, is_read=false, is_dismissed=false)
4. COMMIT

5. AuditLog: action=CREATE, resource_type=notifications,
             new_values={ title, type, recipient_count }
6. Return notification with recipient_count

**Phase 1 limitation — synchronous fan-out:**
The INSERT in step 3b is synchronous. For an institute with 5,000 students, this is 5,000 DB inserts
in a single request. The HTTP response may take several seconds. Admins should be informed via the
UI that sending to large groups takes a moment.
Phase 2 fix: INSERT the notification row, enqueue a BullMQ job for fan-out, return immediately.
The job does the recipient inserts in batches of 100 with retry semantics.
```

**Payment reminder auto-population (frontend concern, backend validates):**
```
When type = 'payment_reminder', frontend pre-fills body with:
"Dear [Student Name], your payment of ₹[Amount] for [Month] is [Status].
Please clear your dues at the earliest."

Admin edits this before sending. Backend receives the final edited body.
Backend does NOT auto-populate body — it only validates length.
```

#### `listAdminNotifications(context)`

```
SELECT n.*, COUNT(nr.id) as recipient_count,
       SUM(CASE WHEN nr.is_read THEN 1 ELSE 0 END) as read_count
FROM notifications n
LEFT JOIN notification_recipients nr ON nr.notification_id = n.id AND nr.is_dismissed = false
WHERE n.institute_id = $ctx.instituteId AND n.is_deleted = false
GROUP BY n.id
ORDER BY n.created_at DESC
LIMIT 20 OFFSET ...
```

#### `deleteNotification(notificationId, context)` — admin deletes

```
1. Fetch notification WHERE id AND institute_id AND is_deleted = false
2. Soft delete:
   UPDATE notifications SET is_deleted=true, deleted_at=now(), deleted_by=$ctx.userId
3. ON DELETE CASCADE on notification_recipients is NOT used here.
   Instead: notification_recipients remain (for audit) but is_deleted on parent hides them.
   → Student queries JOIN with notifications WHERE is_deleted = false → automatically disappears
4. AuditLog: action=DELETE, resource_type=notifications
5. Return { success: true }

Effect: Immediately disappears from ALL students' notification lists.
```

#### `listStudentNotifications(context)`

```
SELECT n.id, n.title, n.body, n.type, n.created_at,
       nr.is_read, nr.read_at, nr.is_dismissed
FROM notification_recipients nr
JOIN notifications n ON nr.notification_id = n.id
WHERE nr.student_id = $ctx.studentId
  AND n.is_deleted = false
  AND nr.is_dismissed = false   -- dismissed notifications excluded
ORDER BY n.created_at DESC
LIMIT 20 OFFSET ...
```

#### `markAllAsRead(context)` — student marks all notifications as read

```
1. UPDATE notification_recipients
   SET is_read = true, read_at = now()
   WHERE student_id = $ctx.studentId
     AND is_read = false
     AND is_dismissed = false
2. Return { updated: count }
```

#### `markAsRead(notificationId, context)` — student marks read

```
1. UPDATE notification_recipients SET is_read=true, read_at=now()
   WHERE notification_id = $notificationId AND student_id = $ctx.studentId
2. Return { read: true }
```

#### `dismissNotification(notificationId, context)` — student dismisses

```
1. UPDATE notification_recipients
   SET is_dismissed=true, dismissed_at=now()
   WHERE notification_id = $notificationId AND student_id = $ctx.studentId
2. If is_read = false: also set is_read = true, read_at = now()
   (Dismissing an unread notification counts as reading it)
3. Return { dismissed: true }

Effect: Removed from this student's list only.
Other students still see it (their row is unaffected).
```

#### `getUnreadCount(context, role)`

```
Admin view — total unread across all students:
SELECT COUNT(*) FROM notification_recipients nr
JOIN notifications n ON nr.notification_id = n.id
WHERE n.institute_id = $ctx.instituteId
  AND n.is_deleted = false
  AND nr.is_read = false
  AND nr.is_dismissed = false

Student view — own unread count:
SELECT COUNT(*) FROM notification_recipients nr
JOIN notifications n ON nr.notification_id = n.id
WHERE nr.student_id = $ctx.studentId
  AND n.is_deleted = false
  AND nr.is_read = false
  AND nr.is_dismissed = false
```

---

### 5.3 Validation Rules

| Field | Rule |
|---|---|
| title | Required, max 100 characters |
| body | Required, max 500 characters |
| type | Must be: `general`, `payment_reminder`, `assessment_reminder` |
| target | Must be: `all`, `specific`, `pending_overdue` |
| studentIds | Required and non-empty if `target = 'specific'` |
| pending_overdue target | Only allowed when `type = 'payment_reminder'` |

---

### 5.4 Pagination Strategy

```
Default: page=1, limit=20
Sort: created_at DESC (newest first — both admin and student views)
No filters — notifications list is in chronological order only
```

---

### 5.5 Soft Delete Enforcement

- Admin deletes: `notifications.is_deleted = true` — all student queries JOIN with `is_deleted = false`, so it disappears instantly for everyone
- Student dismisses: `notification_recipients.is_dismissed = true` — only that student's row is affected
- Neither action hard-deletes any row

---

### 5.6 Audit Log Triggers

| Action | Trigger |
|---|---|
| CREATE | After notification sent (with recipient count) |
| DELETE | After admin soft-deletes notification |

---

### 5.7 Security Checks

- Admin can only send/delete notifications in their own institute
- `institute_id` from JWT — never from body
- Student can only read/dismiss their own `notification_recipients` row
- Student cannot see `notification_recipients` of other students
- `pending_overdue` target validates against payments — requires Payments feature data even though Notifications don't require a feature flag (this is handled in service, not FeatureGuard)

---

---

---

## Module 6 — Dashboard

### 6.1 Controller Endpoints

| Method | Route | Role | Feature Required |
|---|---|---|---|
| GET | `/admin/dashboard` | admin | — |

No feature guard — dashboard always visible. Stats only show data for features the institute has enabled.

---

### 6.2 Service Flow

#### `getDashboardStats(context)`

```
Runs all queries fresh on every load (Phase 1). Redis cache with 5-min TTL in Phase 2.

1. Total students:
   SELECT COUNT(*) FROM students
   WHERE institute_id = $ctx.instituteId AND is_deleted = false

2. Pending payments count (only if payments feature enabled):
   SELECT COUNT(*) FROM payments
   WHERE institute_id = $ctx.instituteId AND status = 'pending' AND is_deleted = false

3. Overdue payments count (only if payments feature enabled):
   SELECT COUNT(*) FROM payments
   WHERE institute_id = $ctx.instituteId AND status = 'overdue' AND is_deleted = false

4. Upcoming assessments (only if assessments feature enabled):
   SELECT id, title, start_at, end_at, status FROM assessments
   WHERE institute_id = $ctx.instituteId
     AND status IN ('published', 'active')
     AND is_deleted = false
   ORDER BY start_at ASC
   LIMIT 5

5. Recent notifications sent (only if notifications available):
   SELECT COUNT(*) FROM notifications
   WHERE institute_id = $ctx.instituteId
     AND is_deleted = false
     AND created_at >= now() - interval '7 days'

6. Unread notification count across all students:
   SELECT COUNT(*) FROM notification_recipients nr
   JOIN notifications n ON nr.notification_id = n.id
   WHERE n.institute_id = $ctx.instituteId
     AND n.is_deleted = false
     AND nr.is_read = false

7. Return:
{
  "students": { "total": N },
  "payments": { "pending": N, "overdue": N },   // null if payments feature disabled
  "assessments": { "upcoming": [...5 items] },  // null if assessments feature disabled
  "notifications": { "sent_last_7_days": N, "total_unread": N }
}
```

**Feature-conditional stats:**
Stats for a disabled feature are returned as `null` (not zero). The frontend renders a "Feature disabled" placeholder instead of a zero count, so admins know the data exists but the feature is off.

---

### 6.3 Security

- `institute_id` from JWT — stats always scoped to caller's institute
- No sensitive data — counts only, no student names or amounts
- Feature-gated stat fields — disabled features return null, not 0

---

---

## Cross-Module Interactions

```
StudentsService
  └── PaymentsService.createCurrentMonthRecord()  ← on student creation
  └── SessionInvalidation (users table)            ← on student soft delete

AssessmentStatusCronService
  └── SubmissionsService.autoSubmitOnClose()       ← on close transition
  └── MCQAutoEvalService.evaluate()                ← after close

PaymentAutoGenerateCronService
  └── StudentsService.getActiveStudents()          ← monthly record creation

NotificationsService
  └── PaymentsRepository.getPendingOverdueStudents()  ← for payment reminder target

AuditLogService
  └── Called by ALL services after every mutation
  └── Never updated, never deleted — insert only
```

---

## Shared Service: AuditLogService

Called after every successful mutation across all modules.

```
record({
  institute_id:  ctx.instituteId,
  actor_id:      ctx.userId,
  actor_role:    ctx.role,
  action:        'CREATE' | 'UPDATE' | 'DELETE' | 'HIDE' | 'UNHIDE' | 'EVALUATE' | 'LOGIN' | 'LOGOUT'
                 | 'BULK_UPLOAD' | 'EXPORT' | 'PUBLISH' | 'RELEASE_RESULTS' | 'REINSTATE'
                 | 'AUTO_GENERATE_PAYMENTS' | 'AUTO_OVERDUE' | 'FINALISE_EVALUATION'
                 | 'FLAG' | 'UNFLAG' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET',
  resource_type: 'students' | 'materials' | 'assessments' | 'payments' | 'notifications' | ...,
  resource_id:   UUID,
  old_values:    JSONB | null,
  new_values:    JSONB | null,
  ip_address:    req.ip
})
→ INSERT INTO audit_logs — never fails silently (use try/catch — log error but don't fail the main operation)
```

---

## Shared Service: FileUploadService

Handles all MinIO interactions. No other service calls MinIO directly.

```
uploadFile(buffer, path, contentType, size) → { url: minio_path }
generatePresignedUrl(path, expirySeconds=900) → { url, expiresAt }
deleteFile(path) → void  (called on hard cleanup — rare)
overwriteFile(buffer, path, contentType) → { url: minio_path }

Path conventions:
  /{institute_id}/materials/{material_id}.pdf
  /{institute_id}/profiles/{student_id}.{jpg|png}
  /{institute_id}/questions/{question_id}.{jpg|png}
  /{institute_id}/submissions/{submission_id}/{filename}
```
