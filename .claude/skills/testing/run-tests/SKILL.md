# Skill: run-tests

## Purpose

Run the correct test suite for the part of Teachly being developed, interpret the output, and fix common test failures. Covers NestJS backend unit/integration tests, Next.js frontend component tests, and end-to-end API tests.

## When to Use

- After implementing a new module or modifying an existing service
- Before raising a PR
- When a CI pipeline fails and you need to reproduce it locally
- When debugging a specific failing test

---

## Workflow

### Step 1 — Identify what to test

Determine the scope from the task at hand:

| Change made | Tests to run |
|---|---|
| Modified a single service method | Unit test for that service only |
| Modified a controller | Unit test for controller + service |
| Added a new module | All tests for that module |
| Modified Prisma schema | Integration tests that hit the DB |
| Modified auth guards or middleware | Auth integration tests |
| Modified a frontend component | Component tests for that component |
| Full release prep | All tests |

### Step 2 — Run backend tests

#### Single module (fastest — use during development)
```bash
cd backend

# Unit tests for one module
npx jest src/<module>/<module>.service.spec.ts --verbose

# All tests in a module directory
npx jest src/<module>/ --verbose

# Watch mode during active development
npx jest src/<module>/ --watch
```

#### All backend tests
```bash
cd backend && npx jest --verbose
```

#### Integration tests (requires test DB)
```bash
# Set test database URL in .env.test
DATABASE_URL="postgresql://..." npx jest --config jest.integration.config.ts --verbose
```

#### Coverage report
```bash
cd backend && npx jest --coverage --coverageDirectory coverage/
```

Open `coverage/lcov-report/index.html` to review uncovered lines.

### Step 3 — Run frontend tests

```bash
cd frontend

# All component tests
npx jest --verbose

# Specific component
npx jest src/components/<ComponentName>.test.tsx --verbose

# Watch mode
npx jest --watch
```

### Step 4 — Interpret test output

#### Common failure patterns and fixes

**Pattern 1 — Missing mock for PrismaService**
```
Error: Cannot read properties of undefined (reading 'findMany')
```
Fix: Add `PrismaService` to the providers array in the test module with a mock:
```typescript
{
  provide: PrismaService,
  useValue: {
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  },
},
```

**Pattern 2 — Test expects old response shape**
```
Expected: { data: [...] }
Received: { success: true, data: [...] }
```
Fix: Update test assertions to include the `success` envelope field.

**Pattern 3 — `instituteId` not injected**
```
TypeError: Cannot read 'instituteId' of undefined
```
Fix: Ensure the test's mock request object includes `instituteId`:
```typescript
const mockRequest = { instituteId: 'test-institute-id', user: { id: 'user-id', role: 'admin' } };
```

**Pattern 4 — Async test not awaited**
```
UnhandledPromiseRejection in test suite
```
Fix: Add `await` to all async service calls in tests and mark test functions as `async`.

**Pattern 5 — Prisma client not generated**
```
Module '"@prisma/client"' has no exported member 'Student'
```
Fix:
```bash
cd backend && npx prisma generate
```

### Step 5 — Write missing tests (when coverage is low)

For each service method that lacks a test, write tests covering:

1. **Happy path** — valid input, correct DB calls, correct return value
2. **Not found** — record doesn't exist or belongs to another institute → `NotFoundException`
3. **Conflict** — duplicate creation attempt → `ConflictException`
4. **Tenant isolation** — record found by ID but wrong `instituteId` → 404, not the record

**Service test template:**
```typescript
describe('<Module>Service', () => {
  let service: <Module>Service;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        <Module>Service,
        AuditLogService,
        {
          provide: PrismaService,
          useValue: createMockPrismaService(),  // helper that mocks all models
        },
      ],
    }).compile();

    service = module.get<<Module>Service>(<Module>Service);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('returns paginated list scoped to instituteId', async () => {
      jest.spyOn(prisma.<model>, 'findMany').mockResolvedValue([mockRecord]);
      jest.spyOn(prisma.<model>, 'count').mockResolvedValue(1);

      const result = await service.findAll('institute-1', { page: 1 });

      expect(prisma.<model>.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { instituteId: 'institute-1', isDeleted: false } })
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when record belongs to another institute', async () => {
      jest.spyOn(prisma.<model>, 'findFirst').mockResolvedValue(null);

      await expect(service.remove('institute-1', 'user-1', 'other-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('soft-deletes — never calls prisma.delete', async () => {
      jest.spyOn(prisma.<model>, 'findFirst').mockResolvedValue(mockRecord);
      jest.spyOn(prisma.<model>, 'update').mockResolvedValue({ ...mockRecord, isDeleted: true });

      await service.remove('institute-1', 'user-1', 'record-id');

      expect(prisma.<model>.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDeleted: true }),
        })
      );
      // Ensure hard delete was never called
      expect(prisma.<model>['delete']).not.toHaveBeenCalled();
    });
  });
});
```

---

## Checklist

- [ ] Correct test command used for scope of change
- [ ] All tests pass (zero failures)
- [ ] No tests skipped with `.skip` or `xit` unless intentional and commented
- [ ] Service tests verify `instituteId` is always included in `where` clauses
- [ ] Service tests verify soft delete (no `prisma.delete()` calls)
- [ ] Service tests verify `AuditLogService.record` is called after mutations
- [ ] Frontend tests cover loading, empty, and error states
- [ ] No `console.log` left in test files

---

## Expected Output

```
PASS  src/students/students.service.spec.ts
  StudentsService
    findAll
      ✓ returns paginated list scoped to instituteId (12ms)
      ✓ returns empty list when no students exist (3ms)
    create
      ✓ creates student with hashed password (8ms)
      ✓ throws ConflictException on duplicate email (4ms)
    remove
      ✓ soft-deletes — never calls prisma.delete (5ms)
      ✓ throws NotFoundException for another institute's record (3ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```
