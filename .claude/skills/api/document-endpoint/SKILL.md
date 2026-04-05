# Skill: document-endpoint

## Purpose

Produce clear, accurate API documentation for a Teachly NestJS endpoint. Covers request/response shape, auth requirements, error codes, and example payloads. Output is suitable for a developer handoff doc or an internal API reference.

## When to Use

- After implementing a new endpoint or modifying an existing one
- When a frontend developer needs to know exactly what to send and what to expect
- When reviewing a module for completeness — ensuring every route is documented
- Before creating a TanStack Query hook on the frontend

---

## Workflow

### Step 1 — Locate the endpoint

Read the controller file for the module being documented:

```
backend/src/<module>/<module>.controller.ts
```

For each `@Get`, `@Post`, `@Patch`, `@Delete` decorator, extract:
- HTTP method
- Route path (combine `@Controller(...)` prefix + method decorator path)
- `@Roles(...)` decorator — who can call it
- `@RequiresFeature(...)` decorator — which feature flag gates it
- `@Public()` — whether auth is skipped
- Parameter sources: `@Param`, `@Query`, `@Body`, `@Req`

### Step 2 — Read the DTOs

Read every DTO referenced in the controller method signatures:

```
backend/src/<module>/dto/*.dto.ts
```

For each DTO class, extract:
- Field name
- Type (from TypeScript type)
- Required or optional (presence/absence of `@IsOptional()`)
- Validation rules (`@MaxLength`, `@IsEmail`, `@IsEnum`, `@Min`/`@Max`, etc.)

### Step 3 — Read the service return values

Read the service method called by the controller:

```
backend/src/<module>/<module>.service.ts
```

Identify what is returned. Map it to the standard envelope:

```typescript
// Standard shape
{ success: true, data: <T>, meta?: { total, page, pageSize } }

// Error shape (thrown as NestJS exceptions — formatted by global filter)
{ success: false, error: { code: string, message: string } }
```

### Step 4 — Identify all error conditions

Look for:
- `NotFoundException` → 404
- `ConflictException` → 409
- `BadRequestException` → 400
- `ForbiddenException` → 403
- `UnauthorizedException` → 401
- Guard failures (missing role, disabled feature, invalid session)

### Step 5 — Write the documentation

Produce one documentation block per endpoint using the format below.

---

## Output Format

````markdown
## API Reference — <Module Name>

**Base URL:** `/api/<route-prefix>`
**Auth:** JWT Bearer token required (all endpoints unless marked Public)
**Feature flag:** `<feature_name>` must be enabled for the institute

---

### `GET /api/<route>`

**Role:** Admin
**Description:** Returns a paginated list of <resources> for the authenticated institute.

**Query Parameters:**
| Parameter | Type    | Required | Description                        |
|-----------|---------|----------|------------------------------------|
| page      | number  | No       | Page number, default 1             |
| search    | string  | No       | Filter by name / email (min 2 chars)|

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

**Errors:**
| Status | Code              | Condition                         |
|--------|-------------------|-----------------------------------|
| 401    | UNAUTHORIZED      | Missing or expired JWT            |
| 403    | FEATURE_DISABLED  | Feature flag off for institute    |

---

### `POST /api/<route>`

**Role:** Admin
**Description:** Creates a new <resource>.

**Request Body:**
| Field   | Type   | Required | Validation              |
|---------|--------|----------|-------------------------|
| name    | string | Yes      | max 255 chars           |
| email   | string | Yes      | valid email, max 255    |
| status  | enum   | No       | `active` \| `inactive`  |

**Example request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
| Status | Code           | Condition                          |
|--------|----------------|------------------------------------|
| 400    | VALIDATION_ERROR | Missing required field or invalid format |
| 409    | CONFLICT       | Email already exists in this institute |
| 401    | UNAUTHORIZED   | Missing or expired JWT             |

---

### `PATCH /api/<route>/:id`

**Role:** Admin
**Description:** Updates a <resource>. All fields optional — only provided fields are updated.

**Path Parameters:**
| Parameter | Type   | Description    |
|-----------|--------|----------------|
| id        | string | UUID of record |

**Request Body:** Same fields as POST, all optional.

**Response `200`:**
```json
{
  "success": true,
  "data": { /* updated record */ }
}
```

**Errors:**
| Status | Code         | Condition                              |
|--------|--------------|----------------------------------------|
| 404    | NOT_FOUND    | Record not found or belongs to another institute |
| 400    | VALIDATION_ERROR | Invalid field value                |

---

### `DELETE /api/<route>/:id`

**Role:** Admin
**Description:** Soft-deletes a <resource>. Data is hidden but not permanently removed.

**Path Parameters:**
| Parameter | Type   | Description    |
|-----------|--------|----------------|
| id        | string | UUID of record |

**Response `200`:**
```json
{ "success": true }
```

**Errors:**
| Status | Code      | Condition                                         |
|--------|-----------|---------------------------------------------------|
| 404    | NOT_FOUND | Record not found or already deleted               |
````

---

## Checklist

- [ ] Every endpoint in the controller is documented (none skipped)
- [ ] `instituteId` is NOT listed as a request parameter (it's injected from JWT — invisible to callers)
- [ ] All DTO fields listed with correct types and validation rules
- [ ] All HTTP error codes documented with the exact condition that triggers them
- [ ] Response `data` shape matches what the service actually returns (not guessed)
- [ ] Feature flag noted if `@RequiresFeature(...)` is present
- [ ] Role noted for every endpoint (`Admin`, `Student`, or `Public`)
- [ ] Timestamps shown in ISO 8601 UTC format in examples
- [ ] File upload endpoints note multipart/form-data, max size, allowed MIME types
