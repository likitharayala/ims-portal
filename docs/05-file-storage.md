# IMS Portal — File Storage Architecture (Section 5)

**Hard rule:** The frontend never talks to MinIO directly. Every file upload, every file access, every URL generation goes through the NestJS backend API. MinIO is on a private network — no public endpoints.

---

## 1. Storage Architecture Overview

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         FILE STORAGE SYSTEM                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CLIENT (Browser)                                                         │
  │                                                                           │
  │  ┌─────────────────────┐    ┌──────────────────────┐                     │
  │  │  File Input          │    │  PDF Viewer           │                     │
  │  │  (multipart/form)    │    │  (PDF.js + pre-signed │                     │
  │  │                      │    │   URL)                │                     │
  │  └──────────┬───────────┘    └───────────▲───────────┘                     │
  └─────────────╪────────────────────────────╪───────────────────────────────┘
                │  HTTPS POST /upload         │  HTTPS GET (pre-signed URL)
                │  (multipart/form-data)      │  (direct to MinIO, time-limited)
                ▼                             │
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  NESTJS BACKEND                                                           │
  │                                                                           │
  │  ┌────────────────────────────────────────────────────────────────────┐  │
  │  │  UPLOAD PIPELINE (sequential — all steps must pass)                │  │
  │  │                                                                    │  │
  │  │  Step 1 ─ MulterGuard      File size limit enforced (early reject) │  │
  │  │  Step 2 ─ MimeValidator    MIME type checked (magic bytes + header)│  │
  │  │  Step 3 ─ ExtValidator     File extension checked (whitelist)      │  │
  │  │  Step 4 ─ SizeValidator    Per-upload-type size ceiling confirmed  │  │
  │  │  Step 5 ─ StructValidator  PDF internal structure verified         │  │
  │  │  Step 6 ─ FileUploadSvc    Stream file to MinIO                   │  │
  │  │  Step 7 ─ DB write         Store MinIO path in database            │  │
  │  └────────────────────────────────────────────────────────────────────┘  │
  │                                                                           │
  │  ┌────────────────────────────────────────────────────────────────────┐  │
  │  │  PRE-SIGNED URL PIPELINE                                            │  │
  │  │                                                                    │  │
  │  │  Step 1 ─ JwtAuthGuard     Valid token + session check             │  │
  │  │  Step 2 ─ OwnershipCheck   File belongs to requester's institute   │  │
  │  │  Step 3 ─ VisibilityCheck  File not hidden/deleted                 │  │
  │  │  Step 4 ─ MinIO SDK        Generate pre-signed GET URL (15 min)   │  │
  │  │  Step 5 ─ Return URL       Client uses URL directly                │  │
  │  └────────────────────────────────────────────────────────────────────┘  │
  └──────────────────────────────┬──────────────────────────────────────────┘
                                 │  Internal network only (no public access)
                                 │  MinIO SDK (S3-compatible API)
                                 ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  MINIO (Object Storage — Production)                                     │
  │                                                                           │
  │  Bucket: ims-portal (private — no public access policy)                  │
  │                                                                           │
  │  /{institute_id}/                                                         │
  │    /materials/    → PDF study materials (one per material record)         │
  │    /profiles/     → Student profile photos (one per student)              │
  │    /submissions/  → Written answer sheet uploads (per submission)         │
  │                                                                           │
  │  Pre-signed URLs:  MinIO generates time-limited signed GET URLs           │
  │  Expiry:           15 minutes (900 seconds)                               │
  │  Method allowed:   GET only — no PUT/DELETE via pre-signed URLs           │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  LOCAL FILESYSTEM (Development only)                                     │
  │                                                                           │
  │  ./uploads/                                                               │
  │    /{institute_id}/materials/{material_id}.pdf                            │
  │    /{institute_id}/profiles/{student_id}.{ext}                            │
  │    /{institute_id}/submissions/{submission_id}/{filename}                 │
  │                                                                           │
  │  Same path convention as MinIO — swap STORAGE_TYPE=local/minio in .env   │
  │  Dev: NestJS serves files via static file server on /files/* route        │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Storage Folder Structure

```
MinIO Bucket: ims-portal
│
├── {institute_id_aaa-111}/                     ← Institute A (isolated namespace)
│   │
│   ├── materials/
│   │   ├── {material_uuid_1}.pdf               ← "Physics Notes" card
│   │   ├── {material_uuid_2}.pdf               ← "Chemistry Guide" card
│   │   └── {material_uuid_3}.pdf               ← (when admin replaces PDF — same path, overwritten)
│   │
│   ├── profiles/
│   │   ├── {student_uuid_1}.jpg                ← Student A profile photo
│   │   ├── {student_uuid_2}.png                ← Student B profile photo
│   │   └── {student_uuid_3}.jpg
│   │
│   └── submissions/
│       ├── {submission_uuid_1}/
│       │   ├── answer_sheet.jpg                ← Written answer uploaded by student
│       │   ├── page2.jpg
│       │   └── extra_notes.pdf
│       └── {submission_uuid_2}/
│           └── full_paper.pdf
│
├── {institute_id_bbb-222}/                     ← Institute B (completely separate)
│   ├── materials/
│   ├── profiles/
│   └── submissions/
│
└── {institute_id_ccc-333}/                     ← Institute C (completely separate)
    ├── materials/
    ├── profiles/
    └── submissions/
```

**Path naming rules:**

| File Type | Path Pattern | Notes |
|---|---|---|
| Study material | `/{inst_id}/materials/{material_id}.pdf` | `material_id` is the DB UUID for that material row |
| Profile photo | `/{inst_id}/profiles/{student_id}.{jpg\|png}` | Extension reflects actual file format |
| Answer upload | `/{inst_id}/submissions/{submission_id}/{original_filename}` | Original filename sanitised (spaces → underscores, special chars stripped) |

**Why UUID paths instead of meaningful names:**
- Unpredictable — cannot be guessed or enumerated
- No conflicts on update — re-uploads overwrite exactly the same path
- Consistent with DB primary keys — path and DB row always in sync

---

## 3. File Type Specifications

| Upload Type | Allowed MIME Types | Allowed Extensions | Max Size | Storage Path |
|---|---|---|---|---|
| Study material | `application/pdf` | `.pdf` | 50 MB | `/{inst_id}/materials/{id}.pdf` |
| Answer sheet | `image/jpeg` `image/png` `application/pdf` | `.jpg` `.jpeg` `.png` `.pdf` | 20 MB total per submission | `/{inst_id}/submissions/{sub_id}/{name}` |
| Profile photo | `image/jpeg` `image/png` | `.jpg` `.jpeg` `.png` | 5 MB | `/{inst_id}/profiles/{student_id}.{ext}` |
| Bulk student Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `.xlsx` | — | Not stored — processed in memory only |

---

## 4. Validation Strategy

Validation runs in layers. Each layer catches a different class of attack. A file must pass every layer before it is accepted.

```
INCOMING FILE
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — SIZE LIMIT (Multer/NestJS)                                        │
│                                                                              │
│  • Set at the Multer interceptor level — rejects before reading full file    │
│  • Study materials:  limits.fileSize = 52_428_800   (50 MB)                 │
│  • Answer uploads:   limits.fileSize = 20_971_520   (20 MB)                 │
│  • Profile photos:   limits.fileSize =  5_242_880   (5 MB)                  │
│  → 413 Payload Too Large if exceeded                                         │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — MIME TYPE CHECK (Content-Type header + magic bytes)               │
│                                                                              │
│  • Check 1: Content-Type header sent by client                               │
│      e.g. "application/pdf" — but client can lie                             │
│  • Check 2: Read first 8 bytes (magic bytes / file signature)               │
│      PDF:  %PDF (25 50 44 46)                                                │
│      JPEG: FF D8 FF                                                          │
│      PNG:  89 50 4E 47 0D 0A 1A 0A                                           │
│      XLSX: 50 4B 03 04 (ZIP-based format)                                    │
│  • Both checks must agree. Mismatch → reject                                 │
│  → 415 Unsupported Media Type if MIME not in whitelist                       │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — FILE EXTENSION CHECK                                               │
│                                                                              │
│  • Extract extension from original filename (lowercased)                     │
│  • Check against per-upload-type whitelist:                                  │
│      Materials: ['.pdf']                                                     │
│      Answers:   ['.jpg', '.jpeg', '.png', '.pdf']                            │
│      Photos:    ['.jpg', '.jpeg', '.png']                                    │
│  • Extension must match the detected MIME type                               │
│      e.g. filename.jpg but MIME says application/pdf → reject                │
│  → 415 if extension not in whitelist or mismatches MIME                      │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — PDF STRUCTURE VALIDATION (PDF files only)                         │
│                                                                              │
│  • For any uploaded PDF: attempt to parse the PDF structure                  │
│  • Use pdf-parse (or similar): checks PDF header, cross-reference table,     │
│    trailer — confirms it is a valid readable PDF, not just a renamed file    │
│  • If parsing fails: reject with 422 'File appears to be corrupt or invalid' │
│  • This also catches zero-page PDFs and password-protected PDFs:             │
│    → Password-protected PDFs: rejected (students cannot view them)           │
│    → Zero-page PDFs: rejected                                                │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — CUMULATIVE SIZE CHECK (answer uploads only)                       │
│                                                                              │
│  For answer sheet uploads specifically:                                      │
│  • Fetch current submission.upload_files from DB                             │
│  • Sum sizes: existing_total + new_file_size                                 │
│  • If > 20 MB: reject with 413 'Total upload size exceeds 20 MB'             │
│  This prevents multiple small uploads that together exceed the limit         │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
                         FILE IS ACCEPTED
                                 │
                                 ▼
                    Stream to MinIO / Local FS
```

### What validation does NOT cover in V1

| Threat | V1 Status | Future Plan |
|---|---|---|
| Antivirus / malware scan | Not in V1 — adds latency + complexity | Phase 3: ClamAV integration via clamd socket |
| PDF JavaScript execution | Mitigated by PDF.js (sandboxed renderer) | Sufficient for V1 |
| Zip bombs in XLSX | Guarded by Multer file size limit | Sufficient for V1 |
| Image metadata (EXIF) | Not stripped in V1 | Phase 3: sharp to strip EXIF before storage |
| Pixel flood attacks (JPEG bombs) | Mitigated by file size cap | Sufficient for V1 |

---

## 5. Secure Upload Flow — Step by Step

### 5.1 Study Material Upload

```
Admin selects PDF file in browser
           │
           │  POST /admin/materials
           │  Content-Type: multipart/form-data
           │  Body: { title, subject, author, description, file: [PDF binary] }
           ▼
┌─────────────────────────────────────┐
│  NestJS MaterialsController          │
│  @UseInterceptors(FileInterceptor)   │
│  Multer config: limits.fileSize=50MB │
└──────────────┬──────────────────────┘
               │
               ▼
     FileValidationPipe runs
     (Layers 1–4 from above)
               │
     FAIL → return 415/413/422 immediately
               │
     PASS ↓
               │
               ▼
┌─────────────────────────────────────┐
│  MaterialsService.uploadMaterial()   │
│                                     │
│  1. Generate material_id = UUID      │
│  2. Build MinIO path:               │
│     /{institute_id}/materials/       │
│     /{material_id}.pdf              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  FileUploadService.uploadFile()      │
│                                     │
│  minioClient.putObject(             │
│    bucket: 'ims-portal',            │
│    object: path,                    │
│    stream: file.buffer,             │
│    size: file.size,                 │
│    metadata: {                      │
│      'Content-Type': 'application/pdf',
│      'X-Institute-Id': institute_id,│
│      'X-Uploaded-By': user_id       │
│    }                                │
│  )                                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  DB Write (only after MinIO success) │
│                                     │
│  INSERT INTO study_materials (       │
│    institute_id, title, subject,    │
│    author, description,             │
│    file_url = minio_path,           │
│    file_name, file_type='pdf',      │
│    file_size_bytes, uploaded_by     │
│  )                                  │
└──────────────┬──────────────────────┘
               │
               ▼
        AuditLog: CREATE / materials
               │
               ▼
    Return material record to admin
    (No URL in response — URL generated
     on demand via separate endpoint)
```

### 5.2 Profile Photo Upload

```
Student selects JPG/PNG file
           │
           │  PUT /student/profile  (multipart/form-data)
           ▼
Validation pipeline (Layers 1–3, no PDF structure check for images)
           │
           ▼
FileUploadService.uploadFile()

Path = /{institute_id}/profiles/{student_id}.{ext}

If student already has a profile photo:
  → Overwrite at same path (no orphan files — same student_id, same ext)
  → If extension changes (jpg→png): delete old path, upload to new path

UPDATE students SET profile_image_url = new_path
```

### 5.3 Answer Sheet Upload (During Active Exam)

```
Student uploads answer file(s) during active assessment
           │
           │  POST /student/assessments/:id/upload  (multipart/form-data)
           ▼
Security checks:
  - JWT valid
  - Assessment status = 'active'  (exam is ongoing)
  - Submission status = 'pending' (student has started but not submitted)
           │
Validation (Layers 1–4, cumulative size check for total ≤ 20 MB)
           │
           ▼
For each file:
  Sanitise filename: strip special chars, replace spaces with underscores
  Path = /{institute_id}/submissions/{submission_id}/{sanitised_name}

Append to submission.upload_files JSONB:
  { url: path, file_name, file_type, size_bytes }

UPDATE submissions SET upload_files = updated_array
```

---

## 6. Pre-Signed URL Access Flow

Files in MinIO are never directly accessible. Every access requires a fresh pre-signed URL generated by NestJS after authorization checks.

```
Student or Admin wants to view a file
           │
           │  GET /student/materials/:id/view-url
           │  OR
           │  GET /admin/assessments/:id/submissions/:sid  (returns file URLs inline)
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  AUTHORIZATION CHECKS (must all pass)                                       │
│                                                                             │
│  1. JWT valid + session_id matches DB                                       │
│  2. institute_id from JWT matches file's institute_id in DB                 │
│  3. Role check:                                                             │
│     - Student requesting material: is_hidden = false AND is_deleted = false │
│     - Admin requesting material: is_deleted = false (sees hidden too)       │
│     - Admin requesting submission: assessment belongs to their institute    │
│  4. For student answer uploads: only admin can view them                    │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼ All checks pass
┌────────────────────────────────────────────────────────────────────────────┐
│  FileUploadService.generatePresignedUrl()                                   │
│                                                                             │
│  minioClient.presignedGetObject(                                            │
│    bucket:  'ims-portal',                                                   │
│    object:  '/{institute_id}/materials/{material_id}.pdf',                  │
│    expiry:  900   ← 15 minutes in seconds                                   │
│  )                                                                          │
│                                                                             │
│  Returns: https://minio.host/ims-portal/{path}?X-Amz-Expires=900           │
│           &X-Amz-Signature=abc123...&X-Amz-Date=...                        │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼
                        Return { url, expiresAt } to client
                                     │
                                     ▼
                     Client PDF.js viewer fetches the file
                     directly from MinIO using the URL
                                     │
                     After 15 min: URL expired
                     Client must request a new URL
```

**Why 15 minutes:**
- Long enough for a student to read/view a document comfortably
- Short enough that a leaked URL becomes useless quickly
- PDF.js fetches the file once and renders it — 15 min is more than sufficient

**Pre-signed URL properties:**
- Signed with MinIO secret key — cannot be forged or modified
- Locked to GET method — cannot be used to upload or delete
- Locked to specific object path — cannot access other files
- URL contains expiry timestamp embedded in signature — MinIO rejects expired URLs

---

## 7. MinIO Integration

### 7.1 Connection Configuration

```
Development (STORAGE_TYPE=local):
  FileUploadService routes all calls to LocalStorageAdapter
  Files saved to ./uploads/{institute_id}/{type}/{filename}
  NestJS serves files via /files/* static route (guarded by auth middleware)

Production (STORAGE_TYPE=minio):
  FileUploadService routes all calls to MinioStorageAdapter
  MinIO client configured with:
    endpoint:   MINIO_ENDPOINT
    accessKey:  MINIO_ACCESS_KEY
    secretKey:  MINIO_SECRET_KEY
    useSSL:     true (production) / false (dev)
    bucketName: MINIO_BUCKET_NAME
```

### 7.2 Storage Adapter Pattern

```
FileUploadService
   │
   ├── if STORAGE_TYPE = 'local'  → LocalStorageAdapter
   │     uploadFile()    → fs.writeFile()
   │     getUrl()        → NestJS static file URL (/files/...)
   │     deleteFile()    → fs.unlink()
   │
   └── if STORAGE_TYPE = 'minio'  → MinioStorageAdapter
         uploadFile()    → minioClient.putObject()
         getUrl()        → minioClient.presignedGetObject() (15 min)
         deleteFile()    → minioClient.removeObject()
         overwriteFile() → minioClient.putObject() on same path
```

This adapter pattern means:
- All service code is identical between dev and production
- Switching environments requires only an `.env` change
- No `if (isProd)` scattered across module code

### 7.3 Bucket Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::ims-portal/*"
    }
  ]
}
```

**Bucket is fully private — no public access at all.** Only the NestJS service account (via `MINIO_ACCESS_KEY` + `MINIO_SECRET_KEY`) can read, write, or generate pre-signed URLs.

### 7.4 MinIO Operations Used

| Operation | When Used | SDK Method |
|---|---|---|
| `putObject` | File upload (new or replace) | `minioClient.putObject(bucket, path, stream, size, metadata)` |
| `presignedGetObject` | Generate view URL | `minioClient.presignedGetObject(bucket, path, expiry=900)` |
| `removeObject` | Delete file (on profile photo extension change) | `minioClient.removeObject(bucket, path)` |
| `statObject` | Verify file exists | `minioClient.statObject(bucket, path)` |
| `listObjects` | Admin tools / cleanup (Phase 5) | `minioClient.listObjects(bucket, prefix)` |

### 7.5 Error Handling

| MinIO Error | Response to Client | DB Action |
|---|---|---|
| Connection refused | 503 Service Unavailable | No DB write — file not saved |
| Timeout | 504 Gateway Timeout | No DB write — file not saved |
| Upload failure mid-stream | 500 Internal Server Error | No DB write — MinIO handles partial cleanup |
| Bucket not found | 500 (startup validation catches this) | — |
| Pre-signed URL generation failure | 500 + retry | No impact on DB |

**Critical rule:** DB is NEVER written before MinIO upload succeeds. If MinIO fails, the DB record is not created. No orphan DB records pointing to non-existent files.

---

## 8. Multi-Tenant File Isolation

Files are isolated between institutes at three independent levels:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ISOLATION LEVEL 1 — PATH NAMESPACE                                       │
│                                                                           │
│  Every file path starts with /{institute_id}/                             │
│  Institute A files:  /aaa-111/materials/...                               │
│  Institute B files:  /bbb-222/materials/...                               │
│                                                                           │
│  Even with a correct pre-signed URL from Institute A,                     │
│  it can only access /aaa-111/* paths.                                     │
│  Pre-signed URLs are path-locked — cannot be redirected to other paths.   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ISOLATION LEVEL 2 — AUTHORIZATION BEFORE URL GENERATION                  │
│                                                                           │
│  NestJS never generates a pre-signed URL without first:                   │
│    1. Verifying JWT is valid                                              │
│    2. Extracting institute_id from JWT                                    │
│    3. Querying DB: does this file's record belong to JWT.institute_id?    │
│                                                                           │
│  A user from Institute A cannot request a URL for Institute B's file     │
│  even if they somehow know the exact path — the DB check blocks it.       │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ISOLATION LEVEL 3 — JWT SIGNATURE                                        │
│                                                                           │
│  institute_id is embedded in the JWT payload, signed with JWT_SECRET.    │
│  A user cannot modify their own institute_id in the token without         │
│  invalidating the signature.                                              │
│  Middleware extracts it as trusted — never from request body.             │
└──────────────────────────────────────────────────────────────────────────┘
```

**What prevents cross-tenant access:**

| Attack Scenario | Why It Fails |
|---|---|
| Student guesses another institute's material path | DB lookup returns 404 (wrong institute_id) — no URL generated |
| Admin from Institute A uses Institute B's file UUID | DB check: `WHERE file_id = $id AND institute_id = $jwt.instituteId` → 404 |
| Attacker replays an expired pre-signed URL | MinIO rejects — signature includes expiry timestamp |
| Attacker modifies the path in a pre-signed URL | MinIO rejects — HMAC signature covers the full path |
| Attacker modifies their JWT institute_id | JWT verification fails — tampered payload changes signature |

---

## 9. Watermark Rendering for Study Materials

Watermarking is the primary protection against content theft. It is applied entirely in the browser using PDF.js — no server-side PDF modification required.

### 9.1 How It Works

```
Student requests view URL
        │
        ▼
NestJS returns pre-signed URL + student's name from JWT
        │
        ▼
Browser loads PDF.js viewer (custom component)
        │
        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  WATERMARK RENDERING PIPELINE (browser-side, per page)                    │
│                                                                           │
│  Step 1: PDF.js renders each page to a <canvas> element                  │
│                                                                           │
│  Step 2: After each page renders, a transparent overlay <div> is          │
│          absolutely positioned on top of the canvas                      │
│                                                                           │
│  Step 3: The overlay renders the watermark text:                         │
│          "{Student Full Name}"                                            │
│          Repeated in a diagonal grid pattern across the entire page       │
│                                                                           │
│  Step 4: CSS styling:                                                     │
│          color: rgba(180, 180, 180, 0.35)   ← semi-transparent grey      │
│          font-size: 18px                                                   │
│          font-weight: bold                                                 │
│          transform: rotate(-30deg)                                         │
│          user-select: none                                                 │
│          pointer-events: none   ← does not block scrolling/selection      │
│                                                                           │
│  Step 5: The overlay is re-applied whenever the page re-renders          │
│          (zoom, scroll, window resize — watermark always present)         │
└──────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ANTI-BYPASS CONTROLS                                                     │
│                                                                           │
│  • Download disabled: PDF.js download button removed from toolbar         │
│  • Right-click blocked: event.preventDefault() on the viewer container   │
│  • Print blocked:                                                         │
│      @media print { .pdf-viewer-container { display: none !important; } } │
│      window.addEventListener('beforeprint', e => e.preventDefault())     │
│  • Dev tools removal: Not blocked (impractical) — watermark still visible │
│    in screenshots because it's rendered onto the canvas at page level    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Watermark Visual Layout (per page)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    John Smith         John Smith         John Smith     │
│                                                         │
│          John Smith         John Smith                  │
│                                                         │
│    John Smith         John Smith         John Smith     │
│                                                         │
│          John Smith         John Smith                  │
│                                                         │
│    John Smith         John Smith         John Smith     │
│                                                         │
└─────────────────────────────────────────────────────────┘

Rotation: -30 degrees
Opacity: 35% (visible enough to trace, light enough to read content)
Repeat: grid pattern — approximately 3-4 columns × 4-5 rows per A4 page
```

### 9.3 Watermark Data Source

```
The student's name used in the watermark comes from:
  JWT payload → user.name field (loaded at login)
  Stored in frontend state (Zustand store)
  Injected into the PDF viewer component as a prop

No additional API call needed for watermark.
The name is always the current logged-in student's name.
Admin viewing a material sees their own name as the watermark.
```

### 9.4 Known Limitation

```
Screenshot prevention is NOT possible in browsers.
A student can:
  - Take a phone photo of the screen
  - Use OS screenshot tools
  - Use screen recording software

This is documented and communicated to users:
  "Documents are watermarked for traceability.
   Complete screenshot prevention is not possible in browsers."

The watermark creates accountability — a leaked screenshot contains
the student's name and is traceable back to the source.
```

---

## 10. File Lifecycle Management

### 10.1 Study Materials

```
UPLOAD
  → MinIO: PUT /{inst}/materials/{id}.pdf
  → DB: study_materials row created

UPDATE (metadata only — no file change)
  → MinIO: no change
  → DB: title/subject/author/description updated

REPLACE (admin uploads new PDF)
  → MinIO: PUT /{inst}/materials/{id}.pdf  ← same path, file overwritten
  → Old pre-signed URLs: remain valid up to 15 min (acceptable window)
  → DB: file_name, file_size_bytes updated

HIDE
  → MinIO: no change (file remains)
  → DB: is_hidden = true

SOFT DELETE
  → MinIO: no change (file retained for data recovery)
  → DB: is_deleted = true
  → Pre-signed URLs: expire within 15 min — no further URLs generated

HARD DELETE (future admin cleanup tool — Phase 5)
  → MinIO: removeObject()
  → DB: permanent deletion (only after long retention period)
```

### 10.2 Profile Photos

```
FIRST UPLOAD
  → MinIO: PUT /{inst}/profiles/{student_id}.jpg
  → DB: profile_image_url = path

REPLACE (student uploads new photo)
  Case A — same extension (jpg → jpg):
    → MinIO: PUT same path (overwrite)
    → DB: profile_image_url unchanged (same path)

  Case B — different extension (jpg → png):
    → MinIO: removeObject(old path)
    → MinIO: PUT /{inst}/profiles/{student_id}.png
    → DB: profile_image_url = new path

STUDENT SOFT DELETE
  → MinIO: file retained (audit/data recovery)
  → DB: students.is_deleted = true
  → No pre-signed URLs generated after deletion
```

### 10.3 Answer Uploads

```
UPLOAD (during active exam)
  → MinIO: PUT /{inst}/submissions/{sub_id}/{filename}
  → DB: append to submissions.upload_files JSONB

Multiple uploads allowed:
  Each file uploaded individually, each appended to upload_files array
  Cumulative size limit enforced: total ≤ 20 MB

ASSESSMENT CLOSED
  → Files remain in MinIO indefinitely
  → Admin views files during evaluation (generates pre-signed URLs)

ASSESSMENT SOFT DELETED
  → MinIO: files retained
  → DB: assessments.is_deleted = true
  → Submissions hidden (no pre-signed URLs generated)
```

---

## 11. Storage Architecture Summary

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SECURITY SUMMARY                                                         │
│                                                                           │
│  ✓ Frontend never touches MinIO directly                                  │
│  ✓ All file access goes through NestJS authorization layer                │
│  ✓ Files isolated by institute_id in path + JWT claim check              │
│  ✓ MIME type validated by magic bytes (not just client header)            │
│  ✓ File extension validated against type whitelist                        │
│  ✓ PDF structure validated (blocks corrupt/encrypted PDFs)                │
│  ✓ Pre-signed URLs expire in 15 minutes                                   │
│  ✓ MinIO bucket is fully private — no public access policy               │
│  ✓ Pre-signed URLs are path-locked and method-locked (GET only)           │
│  ✓ Student watermark in PDF viewer — identifies source of leaks           │
│  ✓ Download, print, right-click all disabled in document viewer           │
│  ✓ DB write only after MinIO write succeeds — no orphan records           │
│  ✓ Local dev uses same path conventions as MinIO — swap via .env          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  FILE STORAGE QUICK REFERENCE                                             │
│                                                                           │
│  Study Material   │ PDF only  │ 50 MB   │ /{inst}/materials/{id}.pdf     │
│  Profile Photo    │ JPG/PNG   │ 5 MB    │ /{inst}/profiles/{id}.{ext}    │
│  Answer Upload    │ JPG/PNG/  │ 20 MB   │ /{inst}/submissions/{sub}/     │
│                   │ PDF       │ total   │   {sanitised_filename}         │
│  Bulk Excel       │ .xlsx     │ —       │ NOT STORED — memory only       │
│                                                                           │
│  Pre-signed URL expiry:  15 minutes (all file types)                     │
│  Dev storage:            ./uploads/  (local filesystem)                  │
│  Prod storage:           MinIO bucket 'ims-portal' (private)             │
│  Adapter:                STORAGE_TYPE env var switches between them       │
└──────────────────────────────────────────────────────────────────────────┘
```
