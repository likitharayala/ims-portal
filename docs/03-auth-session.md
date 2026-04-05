# Section 3: Authentication & Session System

## Overview

The IMS Portal authentication system handles two user types (Admin and Student) with different registration flows, shared JWT-based session management, and strict single active session enforcement.

---

## User Types & Registration

### Admin Registration (Self-Service)

Admin creates their own account via the public Sign Up page.

**Required fields:**
- Name
- Phone number (valid format)
- Email (globally unique across all institutes)
- Institute name (globally unique)
- Password (minimum 8 characters)
- Feature selection checkboxes (at least one):
  - Students Data
  - Study Materials
  - Assessments
  - Payments
  - AI Generation

**On successful signup:**
1. `institutes` row created with selected features stored in `institute_features`
2. `users` row created with `role = admin`, `is_email_verified = false`
3. Verification email sent to admin email with a time-limited token
4. Admin is **not** granted dashboard access until email is verified
5. Login attempt by unverified account returns `403 Email not verified`

**Email verification:**
- Token stored in `users.email_verification_token` with `email_verification_expires_at`
- Token expires after 24 hours
- Clicking the link in the email calls `GET /auth/verify-email?token=<token>`
- On success: `is_email_verified = true`, token fields cleared
- On expiry: admin can request a new verification email from the login page

---

### Student Registration (Admin-Created Only)

Students **cannot** self-register. All student accounts are created by the admin.

**Single student creation:**
1. Admin fills the Add Student form
2. System auto-generates a temporary password (8 characters, alphanumeric)
3. Password is hashed with bcrypt (rounds=12) and stored
4. Temporary password shown **once** on screen after creation (not stored in plaintext)
5. Admin manually shares credentials with the student

**Bulk student upload (Excel):**
1. Admin uploads `.xlsx` file using the provided template
2. System validates columns and rows
3. Valid rows create student accounts with auto-generated passwords
4. After upload: admin sees a summary (X created, Y skipped with reasons)
5. Admin can download a **one-time CSV** of all new student credentials (email + temporary password)
6. This CSV is generated once and not stored on the server

**First login (students):**
- System detects `users.must_change_password = true`
- Student is redirected to a forced password change screen before accessing any feature
- Prompt: "Please set a new password to continue."
- On successful password change: `must_change_password = false`

---

## Login Flow

### Endpoint: `POST /auth/login`

**Accepted credentials:** Email or phone + password

**Steps:**
1. Validate input format
2. Look up user by email or phone (within any institute — email is globally unique)
3. Check `is_email_verified = true` (admin only — students don't require email verification)
4. Check `is_deleted = false`
5. Compare password with bcrypt
6. On success:
   - Generate a new `session_id` (UUID)
   - Store `session_id` in `users.session_id` (overwrites any previous value)
   - Generate access token (15 min) + refresh token (7 days) embedding `session_id`
   - Store refresh token hash in `users.refresh_token_hash`
   - Return both tokens in response
7. Write audit log: `login` event

**Rate limit:** 5 requests per 15 minutes per IP

---

## Token Design

### Access Token (JWT)

Expiry: 15 minutes

Payload:
```json
{
  "sub": "<user_id>",
  "institute_id": "<institute_id>",
  "role": "admin | student",
  "session_id": "<session_id>",
  "iat": 1234567890,
  "exp": 1234568790
}
```

### Refresh Token (JWT)

Expiry: 7 days

Payload:
```json
{
  "sub": "<user_id>",
  "session_id": "<session_id>",
  "type": "refresh"
}
```

Refresh token hash stored in `users.refresh_token_hash`. On use, old token is invalidated and a new pair is issued (rotation).

---

## Single Active Session Enforcement

**Rule:** Only one active session per user at any time.

**How it works:**
1. Every login overwrites `users.session_id` with a new UUID
2. Every protected request validates: JWT `session_id` === DB `users.session_id`
3. If mismatch → return `401` with message "Session expired. Please log in again."
4. This automatically invalidates all other devices when a new login occurs

**Effect:** If a user logs in on Device B while Device A has an active session, Device A's next request will be rejected.

---

## Request Authentication Pipeline

Every protected request passes through the following guard chain in order:

```
1. RateLimitGuard       → enforce per-route rate limits
2. InstituteContextGuard → extract institute_id from JWT, load institute config
3. JwtAuthGuard         → validate JWT signature and expiry
4. SessionGuard         → compare JWT session_id vs DB users.session_id
5. RolesGuard           → check user role against required role for route
6. FeatureGuard         → check if required feature is enabled for this institute
```

All 6 must pass. Failure at any stage returns appropriate error and stops the chain.

---

## Token Refresh

### Endpoint: `POST /auth/refresh`

**Request body:** `{ "refresh_token": "<token>" }`

**Steps:**
1. Verify refresh token signature and expiry
2. Check `type === "refresh"` in payload
3. Load user from DB using `sub`
4. Verify refresh token hash matches `users.refresh_token_hash`
5. Verify `session_id` in token matches `users.session_id`
6. Generate new access token + new refresh token (rotation)
7. Store new refresh token hash in DB
8. Return new token pair

**Rate limit:** 10 requests per 15 minutes per IP

---

## Logout

### Endpoint: `POST /auth/logout`

**Steps:**
1. Validate access token
2. Set `users.session_id = null`
3. Set `users.refresh_token_hash = null`
4. Return `200`
5. Write audit log: `logout` event

After logout, any existing tokens are rejected by session validation.

---

## Forgot Password Flow

### Step 1: Request reset

**Endpoint:** `POST /auth/forgot-password`

**Body:** `{ "email": "<email>" }`

**Steps:**
1. Look up user by email
2. If not found: return same success response (prevent user enumeration)
3. If found: generate a secure random reset token
4. Hash token and store in `users.password_reset_token` with `password_reset_expires_at = now + 30 minutes`
5. Send reset link to email: `{FRONTEND_URL}/reset-password?token=<plain_token>`
6. Return generic success message

**Rate limit:** Covered by general rate limit (100/min per IP). No special limit — brute force is prevented by the 30-minute token expiry.

### Step 2: Reset password

**Endpoint:** `POST /auth/reset-password`

**Body:** `{ "token": "<plain_token>", "new_password": "<password>" }`

**Steps:**
1. Hash the incoming token and find matching `users.password_reset_token`
2. Check `password_reset_expires_at > now`
3. If expired: return `400 Reset link expired. Please request a new one.`
4. Validate new password (minimum 8 characters)
5. Hash new password with bcrypt (rounds=12)
6. Update `users.password_hash`
7. Clear `password_reset_token` and `password_reset_expires_at`
8. Invalidate all active sessions: set `users.session_id = null`, `users.refresh_token_hash = null`
9. Write audit log: `password_reset` event
10. Return `200`

---

## Password Change (Authenticated)

### Endpoint: `POST /auth/change-password`

**Steps:**
1. Validate current password
2. Validate new password (min 8 characters)
3. Hash new password
4. Update `users.password_hash`
5. Rotate session: generate new `session_id`, issue new token pair
6. Invalidate other sessions (old session_id cleared)
7. Write audit log: `password_changed` event

---

## Email Verification Resend

### Endpoint: `POST /auth/resend-verification`

**Body:** `{ "email": "<email>" }`

**Steps:**
1. Look up unverified admin by email
2. Generate new verification token, extend expiry to 24 hours from now
3. Send new verification email
4. Return generic success response

---

## Users Table Fields Related to Auth

```sql
users (
  id                           UUID PRIMARY KEY,
  institute_id                 UUID NOT NULL REFERENCES institutes(id),
  role                         VARCHAR(20) NOT NULL,         -- 'admin' | 'student'
  email                        VARCHAR(255) UNIQUE NOT NULL,
  phone                        VARCHAR(20),
  password_hash                VARCHAR(255) NOT NULL,
  session_id                   UUID,                         -- current active session
  refresh_token_hash           VARCHAR(255),
  is_email_verified            BOOLEAN DEFAULT false,
  email_verification_token     VARCHAR(255),
  email_verification_expires_at TIMESTAMPTZ,
  password_reset_token         VARCHAR(255),
  password_reset_expires_at    TIMESTAMPTZ,
  must_change_password         BOOLEAN DEFAULT false,        -- true for new students
  is_deleted                   BOOLEAN DEFAULT false,
  deleted_at                   TIMESTAMPTZ,
  deleted_by                   UUID,
  created_at                   TIMESTAMPTZ DEFAULT now(),
  updated_at                   TIMESTAMPTZ DEFAULT now()
)
```

---

## Role-Based Access Control

| Role | Access |
|---|---|
| `admin` | Full access to all enabled features of their institute |
| `student` | Read-only access to materials, submit assessments, view own results, view notifications |

The `roles` system is designed to allow expansion (teacher, super-admin) in Phase 5. For Phase 1, only `admin` and `student` exist.

---

## Feature-Based Route Protection

Every protected route declares the feature it belongs to. The `FeatureGuard` checks `institute_features` for that feature's `is_enabled` flag.

Examples:
- `GET /materials` requires `materials` feature enabled
- `POST /assessments` requires `assessments` feature enabled
- `GET /payments` requires `payments` feature enabled

If a feature is disabled mid-session, the next API call for that feature returns `403 Feature not enabled`.

---

## Security Controls Summary

| Control | Implementation |
|---|---|
| Password hashing | bcrypt rounds=12 |
| Token signing | HS256 with `JWT_SECRET` / `JWT_REFRESH_SECRET` from env |
| Single session | `session_id` in JWT matched against DB on every request |
| Rate limiting | Per-route limits (see below) |
| CORS | Only requests from `FRONTEND_URL` env variable are allowed |
| HTTPS | Enforced in production |
| Input validation | All inputs validated and sanitised — no raw SQL |
| Soft delete | Users are never hard-deleted |
| Audit logs | All auth events logged (login, logout, password_reset, password_changed) |

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 requests per 15 minutes per IP |
| `POST /auth/signup` | 3 requests per hour per IP |
| `POST /auth/refresh` | 10 requests per 15 minutes per IP |
| All other routes | 100 requests per minute per IP |

---

## Timezone Note

All `expires_at` fields are stored in UTC. When displaying token expiry or reset link expiry to users in the UI, convert to IST (UTC+5:30).
