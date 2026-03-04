# IMS Portal — Authentication & Session System (Section 3)

Grounded in the requirements:
- Single active session per user (new login kills all previous sessions)
- JWT access + refresh token pair
- bcrypt password hashing
- Rate limiting on all auth endpoints
- Role guard: admin / student
- Feature guard: institute-level feature toggles

---

## 1. JWT Payload Structure

### Access Token (short-lived: 15 minutes)

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub":          "uuid-of-user",
    "institute_id": "uuid-of-institute",
    "role":         "admin",
    "session_id":   "uuid-regenerated-on-every-login",
    "iat":          1709500000,
    "exp":          1709500900
  }
}
```

### Refresh Token (long-lived: 7 days)

```json
{
  "payload": {
    "sub":        "uuid-of-user",
    "session_id": "uuid-same-as-access-token",
    "type":       "refresh",
    "iat":        1709500000,
    "exp":        1709500000 + 604800
  }
}
```

### Why each field exists

| Field | Reason |
|---|---|
| `sub` | User identity — used to load user record |
| `institute_id` | Bound to every DB query — injected by middleware, never trusted from request body |
| `role` | Read by `RolesGuard` — avoids DB lookup on every request |
| `session_id` | Compared against `users.session_id` in DB — detects concurrent sessions |
| `type: "refresh"` | Prevents refresh token being used as an access token |

**Access token is kept at 15 min** — short enough to limit damage if stolen, long enough to not hammer the refresh endpoint.

---

## 2. Session Validation Strategy

### The Single Active Session Rule

```
users table
┌──────────────────────────────────────┐
│ id  │  session_id  │  ...            │
│─────│──────────────│─────────────────│
│ u1  │  sess-abc    │  ← current      │
└──────────────────────────────────────┘

JWT payload carries: session_id = sess-abc

On every request:
  1. Decode JWT → extract session_id = sess-abc
  2. SELECT session_id FROM users WHERE id = u1
  3. JWT.session_id === DB.session_id → proceed
  4. Mismatch → 401 FORCE_LOGOUT

When user logs in from a new device:
  → new session_id = sess-xyz written to DB
  → old device's JWT still has sess-abc
  → next request from old device → mismatch → force logout
```

### Sessions table (refresh token store)

The `sessions` table stores hashed refresh tokens with IP + user agent. This enables:
- Refresh token rotation (old token invalidated on use)
- Full session history per user
- Remote logout (revoke a specific session)

```
On login:
  1. Generate new session_id (UUID)
  2. UPDATE users SET session_id = new_session_id
  3. Create refresh_token (random 64-byte hex string)
  4. INSERT INTO sessions (user_id, session_id, refresh_token_hash, expires_at, ip, user_agent)
  5. Sign access_token with session_id embedded
  6. Return { access_token, refresh_token } to client

On logout:
  1. UPDATE sessions SET revoked_at = now() WHERE session_id = current
  2. UPDATE users SET session_id = NULL
```

---

## 3. Login Request Flow

```
POST /auth/login
Body: { identifier: "email or phone", password: "raw" }

Step 1 — Rate limit check (NGINX / NestJS ThrottlerGuard)
  → 5 attempts per IP per 15 minutes on /auth/login
  → 429 Too Many Requests if exceeded

Step 2 — Input validation (class-validator DTO)
  → identifier: non-empty string
  → password: non-empty string, min 8 chars
  → 400 Bad Request if invalid

Step 3 — Resolve user
  SELECT u.*, i.is_active AS institute_active
  FROM users u
  JOIN institutes i ON i.id = u.institute_id
  WHERE (u.email = $identifier OR u.phone = $identifier)
    AND u.is_deleted = false
  → 401 "Invalid credentials" if not found (never reveal which field was wrong)

Step 4 — Validate institute is active
  → 403 "Institute account is inactive" if i.is_active = false

Step 5 — Validate user is active
  → 403 "Account is inactive" if u.is_active = false

Step 6 — Verify password
  → bcrypt.compare(raw_password, user.password_hash)
  → 401 "Invalid credentials" if mismatch

Step 7 — Generate new session
  → new_session_id = uuidv4()
  → refresh_token  = crypto.randomBytes(64).toString('hex')
  → refresh_token_hash = bcrypt.hash(refresh_token, 10)

Step 8 — Persist session
  → UPDATE users SET session_id = new_session_id, last_login_at = now()
  → INSERT INTO sessions (user_id, institute_id, session_id, refresh_token_hash,
                          ip_address, user_agent, expires_at)

Step 9 — Sign tokens
  → access_token  = jwt.sign({ sub, institute_id, role, session_id }, ACCESS_SECRET,  { expiresIn: '15m' })
  → refresh_token_jwt = jwt.sign({ sub, session_id, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '7d' })

Step 10 — Write audit log
  → INSERT INTO audit_logs (institute_id, actor_id, action: 'LOGIN', resource_type: 'users', resource_id: user.id, ip_address)

Step 11 — Return response
  {
    "access_token":  "eyJ...",
    "refresh_token": "eyJ...",
    "user": {
      "id":           "uuid",
      "name":         "string",
      "role":         "admin | student",
      "institute_id": "uuid",
      "features":     ["students", "materials"]   ← enabled features for this institute
    }
  }
```

---

## 4. Refresh Token Flow

```
POST /auth/refresh
Body: { refresh_token: "eyJ..." }

Step 1 — Verify JWT signature and expiry (REFRESH_SECRET)
  → 401 if invalid or expired

Step 2 — Confirm type = "refresh"
  → 401 if payload.type !== "refresh"

Step 3 — Find session record
  SELECT * FROM sessions
  WHERE session_id = payload.session_id
    AND user_id = payload.sub
    AND revoked_at IS NULL
    AND expires_at > now()
  → 401 if not found (already used, revoked, or expired)

Step 4 — Verify refresh token hash
  → bcrypt.compare(incoming_token_body, session.refresh_token_hash)
  → 401 if mismatch (token reuse attack — revoke entire session)

Step 5 — Rotate: invalidate old, create new
  → UPDATE sessions SET revoked_at = now() WHERE id = old_session.id
  → new_session_id     = uuidv4()
  → new_refresh_token  = crypto.randomBytes(64).toString('hex')
  → UPDATE users SET session_id = new_session_id
  → INSERT new session record

Step 6 — Sign and return new token pair
  → { access_token, refresh_token }
```

**Refresh token rotation** means every `/auth/refresh` call invalidates the previous refresh token and issues a new one. If a stolen refresh token is replayed after it's been legitimately rotated, bcrypt compare fails → full session revocation.

---

## 5. Middleware & Guard Pipeline

Every request passes through this ordered chain:

```
Incoming Request
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  1. NGINX RateLimitMiddleware                                 │
│  Config:                                                      │
│    /auth/login     → 5 req / 15 min / IP                     │
│    /auth/refresh   → 10 req / 15 min / IP                    │
│    /auth/signup    → 3 req / hour / IP                       │
│    all other routes → 100 req / min / IP                     │
│  Response: 429 with Retry-After header                        │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  2. InstituteContextMiddleware  (NestJS Global Middleware)    │
│                                                               │
│  if route is public (@Public() decorator) → skip             │
│  else:                                                        │
│    decode JWT without verifying (just read payload)           │
│    extract institute_id from payload                          │
│    attach to request: req.instituteId = institute_id          │
│    attach to request: req.userId     = sub                    │
│    attach to request: req.role       = role                   │
│                                                               │
│  Purpose: downstream code never reads from request.body       │
│  for institute_id — always from req.instituteId (trusted)    │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  3. JwtAuthGuard  (NestJS Guard)                              │
│                                                               │
│  if route is @Public() → skip                                 │
│                                                               │
│  a) Verify JWT signature with ACCESS_SECRET                   │
│     → 401 if invalid or expired                               │
│                                                               │
│  b) Extract session_id from payload                           │
│                                                               │
│  c) SELECT session_id FROM users                              │
│     WHERE id = payload.sub AND is_deleted = false             │
│     → 401 if user not found                                   │
│                                                               │
│  d) Compare payload.session_id === db.session_id              │
│     → 401 { code: 'SESSION_INVALIDATED' } if mismatch        │
│     (Frontend intercepts this code to show "Logged in         │
│      elsewhere" message rather than generic error)            │
│                                                               │
│  e) Attach full user to request: req.user = { id, role, ... } │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  4. RolesGuard  (NestJS Guard)                                │
│                                                               │
│  Read @Roles('admin') or @Roles('student') from route         │
│  Compare with req.user.role                                   │
│  → 403 if mismatch                                            │
│                                                               │
│  Usage:                                                       │
│  @Roles('admin')                                              │
│  @Get('/students')                                            │
│  getStudents() { ... }                                        │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  5. FeatureGuard  (NestJS Guard)                              │
│                                                               │
│  Read @RequiresFeature('assessments') from route              │
│                                                               │
│  Query institute features:                                    │
│  SELECT feature_id FROM institute_features                    │
│  WHERE institute_id = req.instituteId                         │
│  (Result cached in Redis — Phase 2)                           │
│                                                               │
│  Check if required feature is in enabled list                 │
│  → 403 { code: 'FEATURE_NOT_ENABLED' } if missing            │
│  (Frontend uses this code to show upgrade prompt)             │
│                                                               │
│  Usage:                                                       │
│  @RequiresFeature('assessments')                              │
│  @Roles('admin')                                              │
│  @Get('/assessments')                                         │
│  getAssessments() { ... }                                     │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
               Controller / Service
               (business logic executes here)
```

---

## 6. Role-Based Access Control

### Decorator definition

```typescript
// Custom decorators
export const Roles   = (...roles: string[]) => SetMetadata('roles', roles);
export const Public  = ()                   => SetMetadata('isPublic', true);
export const RequiresFeature = (f: string)  => SetMetadata('feature', f);
```

### Route protection matrix

| Route | Method | @Roles | @RequiresFeature | @Public |
|---|---|---|---|---|
| /auth/login | POST | — | — | ✓ |
| /auth/signup | POST | — | — | ✓ |
| /auth/refresh | POST | — | — | ✓ |
| /auth/logout | POST | admin, student | — | — |
| /admin/dashboard | GET | admin | — | — |
| /admin/students | GET/POST | admin | students | — |
| /admin/materials | GET/POST | admin | materials | — |
| /admin/assessments | GET/POST | admin | assessments | — |
| /admin/assessments/:id/evaluate | PATCH | admin | assessments | — |
| /admin/payments | GET/PATCH | admin | payments | — |
| /admin/notifications | GET/POST | admin | — | — |
| /student/profile | GET/PATCH | student | — | — |
| /student/materials | GET | student | materials | — |
| /student/assessments | GET | student | assessments | — |
| /student/assessments/:id/submit | POST | student | assessments | — |
| /student/marks | GET | student | assessments | — |
| /student/notifications | GET | student | — | — |

---

## 7. Sequence Diagram — Full Authentication Flow

```
┌────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐     ┌───────┐
│ Client │     │  NGINX   │     │ NestJS  │     │ Postgres │     │ Redis │
└───┬────┘     └────┬─────┘     └────┬────┘     └────┬─────┘     └───┬───┘
    │               │                │               │               │
    │ POST /login   │                │               │               │
    │──────────────►│                │               │               │
    │               │ rate check OK  │               │               │
    │               │───────────────►│               │               │
    │               │                │ validate DTO  │               │
    │               │                │ SELECT user   │               │
    │               │                │──────────────►│               │
    │               │                │◄──────────────│               │
    │               │                │ bcrypt compare│               │
    │               │                │ gen session_id│               │
    │               │                │ UPDATE users  │               │
    │               │                │ SET session_id│               │
    │               │                │──────────────►│               │
    │               │                │ INSERT session │               │
    │               │                │ (refresh hash) │               │
    │               │                │──────────────►│               │
    │               │                │ INSERT audit   │               │
    │               │                │──────────────►│               │
    │               │                │ sign tokens   │               │
    │◄──────────────────────────────-│               │               │
    │ {access_token, refresh_token,  │               │               │
    │  user: {role, features[]}}     │               │               │
    │               │                │               │               │
    │               │                │               │               │
    │ GET /admin/students            │               │               │
    │ Bearer: access_token           │               │               │
    │──────────────►│                │               │               │
    │               │ rate check OK  │               │               │
    │               │───────────────►│               │               │
    │               │                │ verify JWT sig│               │
    │               │                │ SELECT session│               │
    │               │                │──────────────►│               │
    │               │                │◄──────────────│               │
    │               │                │ session match?│               │
    │               │                │ check role    │               │
    │               │                │ check feature─────────────────►
    │               │                │               │    (cached)   │
    │               │                │◄──────────────────────────────│
    │               │                │ execute query │               │
    │               │                │──────────────►│               │
    │               │                │◄──────────────│               │
    │◄──────────────────────────────-│               │               │
    │ { students[] }                 │               │               │
    │               │                │               │               │
    │               │                │               │               │
    │ access_token expires (15 min)  │               │               │
    │               │                │               │               │
    │ POST /auth/refresh             │               │               │
    │ Body: { refresh_token }        │               │               │
    │──────────────►│───────────────►│               │               │
    │               │                │ verify refresh│               │
    │               │                │ find session  │               │
    │               │                │──────────────►│               │
    │               │                │◄──────────────│               │
    │               │                │ bcrypt compare│               │
    │               │                │ REVOKE old    │               │
    │               │                │──────────────►│               │
    │               │                │ new session_id│               │
    │               │                │ UPDATE users  │               │
    │               │                │──────────────►│               │
    │               │                │ INSERT new    │               │
    │               │                │ session       │               │
    │               │                │──────────────►│               │
    │◄──────────────────────────────-│               │               │
    │ { new_access_token,            │               │               │
    │   new_refresh_token }          │               │               │
    │               │                │               │               │
    │               │                │               │               │
    │ POST /auth/logout              │               │               │
    │ Bearer: access_token           │               │               │
    │──────────────►│───────────────►│               │               │
    │               │                │ verify JWT    │               │
    │               │                │ REVOKE session│               │
    │               │                │──────────────►│               │
    │               │                │ SET session_id│               │
    │               │                │ = NULL        │               │
    │               │                │──────────────►│               │
    │               │                │ INSERT audit  │               │
    │               │                │ LOGOUT        │               │
    │               │                │──────────────►│               │
    │◄──────────────────────────────-│               │               │
    │ { success: true }              │               │               │
└───┴────┘     └────┴─────┘     └────┴────┘     └────┴─────┘     └───┴───┘
```

---

## 8. Token Storage Strategy (Frontend)

| Token | Where stored | Why |
|---|---|---|
| `access_token` | Memory only (JS variable / Zustand store) | Never persisted — lost on tab close, safe from XSS persistent theft |
| `refresh_token` | `httpOnly` cookie (Secure, SameSite=Strict) | Not accessible to JS at all — immune to XSS |

**httpOnly cookie config (NestJS response):**
```
Set-Cookie: refresh_token=<value>;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Path=/auth/refresh;
  Max-Age=604800
```

`Path=/auth/refresh` means the cookie is only sent to the refresh endpoint — not to every API call.

**On app load (page refresh):** access_token is gone from memory → silently call `POST /auth/refresh` → get new access_token. If refresh is also expired/revoked → redirect to login.

---

## 9. Rate Limiting Strategy

### Tiered limits

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| `POST /auth/login` | 5 requests | 15 minutes | Per IP |
| `POST /auth/signup` | 3 requests | 1 hour | Per IP |
| `POST /auth/refresh` | 10 requests | 15 minutes | Per IP |
| `POST /auth/forgot-password` (Phase 2) | 3 requests | 1 hour | Per IP |
| All other routes | 100 requests | 1 minute | Per IP |
| All other routes | 500 requests | 1 minute | Per institute_id |

### Implementation (Phase 1 — NestJS ThrottlerModule)

```typescript
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000,  limit: 10  },  // 10/sec burst
  { name: 'medium', ttl: 60000, limit: 100 },  // 100/min sustained
])
```

Auth endpoints use a stricter custom guard that overrides the default.

### Phase 2 — Redis-backed rate limiting

Move to `ioredis` + sliding window algorithm for distributed rate limiting when running multiple NestJS instances behind NGINX.

---

## 10. Password Policy

| Rule | Value |
|---|---|
| Minimum length | 8 characters |
| bcrypt rounds | 12 (balances security vs. login latency ~300ms) |
| Storage | Hash only — plain text never logged or stored |
| Reset flow | Time-limited token (Phase 2) |

---

## 11. Error Response Standards

All auth errors return consistent structure — never leak internal details:

```json
{ "statusCode": 401, "code": "INVALID_CREDENTIALS",    "message": "Invalid email or password" }
{ "statusCode": 401, "code": "SESSION_INVALIDATED",    "message": "You have been logged in elsewhere" }
{ "statusCode": 401, "code": "TOKEN_EXPIRED",          "message": "Session expired, please log in again" }
{ "statusCode": 403, "code": "INSUFFICIENT_ROLE",      "message": "Access denied" }
{ "statusCode": 403, "code": "FEATURE_NOT_ENABLED",    "message": "This feature is not enabled for your institute" }
{ "statusCode": 403, "code": "INSTITUTE_INACTIVE",     "message": "Institute account is inactive" }
{ "statusCode": 429, "code": "RATE_LIMIT_EXCEEDED",    "message": "Too many attempts, try again later" }
```

Frontend maps `code` values to user-friendly messages — never shows raw backend errors.

---

## 12. Security Checklist

| Control | Implementation |
|---|---|
| Brute force protection | Rate limiting on /auth/login (5/15min/IP) |
| Credential stuffing | Same rate limit applies regardless of valid/invalid user |
| Session hijacking | Short-lived access tokens (15 min) + session_id comparison |
| Concurrent sessions | Single session_id in users table — new login kills old |
| Token theft (XSS) | Access token in memory only; refresh token in httpOnly cookie |
| CSRF | SameSite=Strict on refresh token cookie |
| Token replay | Refresh token rotation — used token is immediately revoked |
| Password exposure | bcrypt(12) — never store or log plaintext |
| Cross-tenant access | institute_id in JWT + enforced in every DB query |
| Privilege escalation | Role in JWT verified against DB on sensitive routes |
| Enumeration | Identical error message for wrong email vs wrong password |
