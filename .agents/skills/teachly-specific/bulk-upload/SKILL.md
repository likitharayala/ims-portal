# Skill: bulk-upload

## Purpose

Implement, debug, or extend the Teachly student bulk upload feature end-to-end: Excel parsing, validation, bcrypt password generation, BullMQ async processing, credential CSV delivery, and error reporting back to the admin.

## When to Use

- Implementing the bulk upload feature for the first time
- Debugging a failed bulk upload (timeout, partial success, wrong error messages)
- Extending bulk upload to support new columns or new validation rules
- Reviewing the bulk upload flow for correctness and security

---

## System Context

The bulk upload flow has two phases:

**Phase 1 (synchronous — HTTP handler):**
1. Admin uploads `.xlsx` file
2. Backend validates file type and column headers
3. Backend enqueues a BullMQ job and returns `{ jobId }`

**Phase 2 (asynchronous — BullMQ worker):**
4. Worker reads rows, validates each, hashes passwords in parallel batches of 50
5. Creates student records in DB
6. Generates credential CSV in memory
7. Stores CSV temporarily (job result or Redis)
8. Admin polls `GET /bulk-upload/status/:jobId` to get progress and download link

**Why async?** bcrypt at 12 rounds per student × 500 students ≈ 10+ minutes synchronously — well past any HTTP timeout. BullMQ decouples the work.

---

## Workflow

### Step 1 — Locate the existing implementation

```
backend/src/students/
  students.controller.ts     → bulk upload endpoint
  students.service.ts        → synchronous validation
  bulk-upload.processor.ts   → BullMQ worker (if exists)
  bulk-upload.job.ts         → job data type definition
```

Read each file before making any changes.

### Step 2 — Validate the HTTP handler

The controller endpoint must:
- Accept `multipart/form-data`
- Validate MIME type from magic bytes (not Content-Type header): `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Validate file extension: `.xlsx` only
- Read column headers immediately to check required columns are present
- Enqueue the BullMQ job with `{ instituteId, adminUserId, buffer: file.buffer }`
- Return `{ success: true, data: { jobId } }` — never wait for processing

**Required Excel columns** (reject entire file if any are missing or renamed):
```
Name, Email, Phone, Roll Number, Batch, Date of Birth, Parent Name, Parent Phone
```

```typescript
// Column validation pattern
const REQUIRED_COLUMNS = ['Name', 'Email', 'Phone', 'Roll Number', 'Batch', 'Date of Birth', 'Parent Name', 'Parent Phone'];
const headers = worksheet.getRow(1).values as string[];
const missing = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
if (missing.length > 0) {
  throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
}
```

### Step 3 — Validate the BullMQ processor

The processor must handle:

#### 3a. Row-level validation
Each row is validated before any DB write. Invalid rows are collected in an `errors[]` array — they do NOT stop processing of valid rows.

```typescript
interface RowError {
  row: number;
  email: string;
  reason: string;
}
```

Validation rules per row:
- `Name` — required, max 255 chars
- `Email` — valid email format, max 255 chars
- `Phone` — digits only, 10 digits
- `Roll Number` — required, max 50 chars
- `Date of Birth` — valid date, student must be ≥ 5 years old
- `Email` — no duplicate within the file (first occurrence wins)
- `Email` — no duplicate in the institute's existing students (skip, add to errors)

#### 3b. Password generation
```typescript
// Generate per student — NEVER reuse across students
const tempPassword = generateTempPassword(); // 8-char alphanumeric
const passwordHash = await bcrypt.hash(tempPassword, 12);
```

**Batch processing to avoid memory overload:**
```typescript
const BATCH_SIZE = 50;
for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
  const batch = validRows.slice(i, i + BATCH_SIZE);
  // Hash all passwords in this batch in parallel
  const hashed = await Promise.all(
    batch.map(row => bcrypt.hash(row.tempPassword, 12))
  );
  // Write batch to DB in a transaction
  await prisma.$transaction(
    batch.map((row, idx) =>
      prisma.student.create({ data: { ...row, passwordHash: hashed[idx], instituteId } })
    )
  );
  // Update job progress
  await job.updateProgress(Math.round(((i + BATCH_SIZE) / validRows.length) * 100));
}
```

#### 3c. Credential CSV generation

Built in-memory — never written to disk:

```typescript
const csvRows = createdStudents.map(s => ({
  Name: s.name,
  Email: s.email,
  'Temp Password': s.tempPassword,  // plaintext — only exists in this job result
  'Roll Number': s.rollNumber,
}));
const csv = stringify(csvRows, { header: true });
// Store in job result — admin downloads via GET /bulk-upload/status/:jobId/download
```

**Security rule:** The plaintext `tempPassword` exists ONLY in:
1. The job result (stored in Redis by BullMQ, TTL 24h)
2. The downloaded CSV (streamed to admin, never stored on disk)

It must NEVER be:
- Written to any database column
- Written to any log
- Returned in the job status polling response (only the download link)

#### 3d. Audit logging

```typescript
await auditLog.record({
  instituteId,
  userId: adminUserId,
  action: 'BULK_UPLOAD',
  newValues: {
    totalRows,
    created: createdStudents.length,
    skipped: errors.length,
  },
});
```

### Step 4 — Validate the status polling endpoint

`GET /admin/students/bulk-upload/status/:jobId`

Response while in progress:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "processing",
    "progress": 42,
    "totalRows": 500,
    "processedRows": 210
  }
}
```

Response on completion:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "completed",
    "summary": {
      "total": 500,
      "created": 487,
      "skipped": 13
    },
    "errors": [
      { "row": 5, "email": "dup@example.com", "reason": "Email already exists" }
    ],
    "downloadUrl": "/admin/students/bulk-upload/download/uuid"
  }
}
```

Security check on polling: verify `job.data.instituteId === req.instituteId` — an admin from institute A must not see institute B's job.

### Step 5 — Validate the CSV download endpoint

`GET /admin/students/bulk-upload/download/:jobId`

- Verify job belongs to `req.instituteId`
- Retrieve CSV from job result in Redis
- Stream as `Content-Type: text/csv`, `Content-Disposition: attachment; filename="credentials.csv"`
- Return 404 if job result has expired (24h TTL)
- Return 404 if job is not yet completed

---

## Checklist

- [ ] HTTP handler returns `{ jobId }` immediately — never waits for processing
- [ ] MIME type validated from magic bytes, not Content-Type header
- [ ] Required column check rejects entire file if any column is missing or renamed
- [ ] BullMQ worker processes in batches of 50 — not all at once
- [ ] bcrypt called with rounds=12 on every password
- [ ] Promise.all used within each batch for parallel hashing
- [ ] Duplicate emails within file: first row wins, rest added to errors[]
- [ ] Duplicate emails vs DB: row skipped, added to errors[], processing continues
- [ ] Plaintext temp password NEVER written to database or logs
- [ ] Credential CSV streamed from memory — never written to disk
- [ ] CSV download endpoint verifies job belongs to requesting institute
- [ ] Job result expires in Redis after 24h (BullMQ TTL config)
- [ ] Job progress updated so polling endpoint shows meaningful progress
- [ ] Audit log written with summary (created count, skipped count)
- [ ] Error summary returned in completion response

---

## Expected Output

**HTTP response (immediate):**
```json
{ "success": true, "data": { "jobId": "abc-123" } }
```

**Polling response (completed):**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "summary": { "total": 500, "created": 487, "skipped": 13 },
    "errors": [ ... ],
    "downloadUrl": "/admin/students/bulk-upload/download/abc-123"
  }
}
```

**CSV download:**
```
Name,Email,Temp Password,Roll Number
John Doe,john@example.com,Ax7kP2mQ,ROLL001
Jane Smith,jane@example.com,Bz3nW8vR,ROLL002
```
