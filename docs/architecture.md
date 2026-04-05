# IMS Portal — High Level Architecture

## 1. Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LAYER 1: CLIENT                          │
│                                                                 │
│   Browser (Admin Dashboard)        Browser (Student Portal)     │
│   Next.js — Role-aware rendering   Next.js — Feature-filtered   │
│   Tailwind UI — Card-based layout  Tailwind UI — Read-only      │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTPS / REST + JSON
┌────────────────────────▼────────────────────────────────────────┐
│                       LAYER 2: API GATEWAY                      │
│                                                                 │
│   NGINX Reverse Proxy                                           │
│   ├── Rate Limiting (per IP + per institute)                    │
│   ├── SSL Termination                                           │
│   └── Route forwarding → NestJS                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    LAYER 3: APPLICATION (NestJS)                 │
│                                                                 │
│  Global Middleware → JwtAuthGuard → RolesGuard → FeatureGuard   │
│                                                                 │
│  ┌──────────┬──────────┬────────────┬──────────┬────────────┐  │
│  │ Auth     │ Students │ Materials  │Assessments│ Payments   │  │
│  └──────────┴──────────┴────────────┴──────────┴────────────┘  │
│                                                                 │
│  Shared: AuditLog Service │ FileUpload Service │ AI Service     │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    LAYER 4: INFRASTRUCTURE                       │
│   PostgreSQL  │  MinIO (files)  │  OpenAI/Ollama  │  Redis(P2)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Request Lifecycle (7-Stage Pipeline)

Every API request passes through these stages in order:

| Stage | Component | Action | Failure |
|---|---|---|---|
| 1 | NGINX | Rate limit check, SSL termination | 429 Too Many Requests |
| 2 | InstituteContextMiddleware | Extract `institute_id` from JWT, bind to request | — |
| 3 | JwtAuthGuard | Verify JWT signature + compare `session_id` vs DB | 401 Force Logout |
| 4 | RolesGuard | Check `user.role` against `@Roles()` decorator | 403 Forbidden |
| 5 | FeatureGuard | Check `institute.features[]` against `@RequiresFeature()` | 403 Forbidden |
| 6 | Business Logic | Execute operation; write to `audit_logs` on mutations | 4xx/5xx |
| 7 | Response | `{ success, data, meta, error }` envelope | — |

---

## 3. Multi-Tenant Isolation

**Strategy:** Shared database, every table has `institute_id` column.

| Boundary | Mechanism |
|---|---|
| Network | JWT carries `institute_id` — cannot be forged |
| Application | `InstituteContextMiddleware` validates and binds to all requests |
| Database | Every query filters `WHERE institute_id = ? AND is_deleted = false` |
| Storage | MinIO path: `/{institute_id}/{resource_type}/{filename}` |

---

## 4. Feature Toggle Flow

```
Admin Signup → selects features → stored in institutes.enabled_features[]
                                          │
              ┌───────────────────────────┼──────────────────────┐
              ▼                           ▼                      ▼
     /auth/me returns            FeatureGuard blocks       Frontend sidebar
     features[] for institute    disabled routes (403)     renders only
                                                           enabled items
```

---

## 5. Single Active Session

```
Login → generate new session_id → store in DB → embed in JWT
                                                      │
Every request → JwtAuthGuard → compare JWT.session_id vs DB.session_id
                                      │
                              match? → proceed
                              mismatch? → 401 (other device logged in)
```

---

## 6. Admin vs Student Separation

| Aspect | Admin | Student |
|---|---|---|
| Route prefix | `/admin/*` | `/student/*` |
| Guard | `@Roles('admin')` | `@Roles('student')` |
| Materials | Full CRUD | View-only, watermarked, no download |
| Assessments | Create, evaluate, grade | Submit, view results after evaluation |
| Students data | Full CRUD | Own profile only |
| Payments | Edit status | Not accessible |
