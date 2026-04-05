# Skill: create-module

## Purpose

Scaffold a complete, production-ready NestJS module for Teachly following all architectural non-negotiables: multi-tenancy, soft delete, audit logging, guard chain, DTO validation, and response envelope.

## When to Use

- Adding a brand-new feature module (e.g., `attendance`, `timetable`, `certificates`)
- Any time a feature requires its own controller + service + Prisma model
- After the `feature-architect` agent has produced the feature design document

---

## Workflow

### Step 1 — Read the feature design

1. Read `.claude/agents/feature-architect/AGENT.md` to understand the output format
2. Locate the feature design document in `docs/` if one exists
3. Identify: module name, DB tables, endpoints, roles, feature toggle required

### Step 2 — Check existing patterns

Read these files to match the existing code style before generating anything:

```
backend/src/<any-existing-module>/<module>.controller.ts
backend/src/<any-existing-module>/<module>.service.ts
backend/src/<any-existing-module>/dto/create-<module>.dto.ts
backend/src/<any-existing-module>/<module>.module.ts
```

Key patterns to copy:
- How `@RequestContext()` or `req.instituteId` is extracted
- How `AuditLogService.record(...)` is called
- How the response envelope `{ success, data, meta }` is constructed
- How `PrismaService` is injected

### Step 3 — Generate the Prisma model

Add the new model to `backend/prisma/schema.prisma`:

```prisma
model <ModelName> {
  id          String    @id @default(uuid())
  instituteId String
  institute   Institute @relation(fields: [instituteId], references: [id])

  // --- domain fields here ---

  isDeleted   Boolean   @default(false)
  deletedAt   DateTime?
  deletedBy   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([instituteId, isDeleted])
}
```

Rules:
- UUID PKs only — never integer IDs
- All VARCHAR columns must have `@db.VarChar(N)` annotation
- Status fields must use Prisma `enum`, not raw `String`
- Every mutable table gets soft delete fields

### Step 4 — Generate the migration

```bash
cd backend && npx prisma migrate dev --name add_<module_name>
```

Then open the generated migration SQL and add partial indexes manually:

```sql
CREATE INDEX idx_<table>_<field> ON "<Table>"("instituteId", "field")
  WHERE "isDeleted" = false;
```

### Step 5 — Scaffold module files

Create the following files:

```
backend/src/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
    create-<module>.dto.ts
    update-<module>.dto.ts
    query-<module>.dto.ts      (pagination + filters)
```

#### `<module>.module.ts`
```typescript
@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [<Module>Controller],
  providers: [<Module>Service],
})
export class <Module>Module {}
```

#### `<module>.controller.ts`
```typescript
@Controller('<route>')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequiresFeature(Feature.<FEATURE>)
export class <Module>Controller {
  constructor(private readonly <module>Service: <Module>Service) {}

  @Get()
  @Roles(Role.Admin)
  async findAll(@Req() req, @Query() query: Query<Module>Dto) {
    return this.<module>Service.findAll(req.instituteId, query);
  }

  @Post()
  @Roles(Role.Admin)
  async create(@Req() req, @Body() dto: Create<Module>Dto) {
    return this.<module>Service.create(req.instituteId, req.user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  async update(@Req() req, @Param('id') id: string, @Body() dto: Update<Module>Dto) {
    return this.<module>Service.update(req.instituteId, req.user.id, id, dto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  async remove(@Req() req, @Param('id') id: string) {
    return this.<module>Service.remove(req.instituteId, req.user.id, id);
  }
}
```

#### `<module>.service.ts`
```typescript
@Injectable()
export class <Module>Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(instituteId: string, query: Query<Module>Dto) {
    const { page = 1 } = query;
    const skip = (page - 1) * 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.<model>.findMany({
        where: { instituteId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        skip,
        take: 20,
      }),
      this.prisma.<model>.count({ where: { instituteId, isDeleted: false } }),
    ]);

    return { success: true, data: items, meta: { total, page, pageSize: 20 } };
  }

  async create(instituteId: string, userId: string, dto: Create<Module>Dto) {
    const record = await this.prisma.<model>.create({
      data: { ...dto, instituteId },
    });

    try {
      await this.auditLog.record({ instituteId, userId, action: 'CREATE_<MODEL>', targetId: record.id, newValues: record });
    } catch {}

    return { success: true, data: record };
  }

  async remove(instituteId: string, userId: string, id: string) {
    const record = await this.prisma.<model>.findFirst({ where: { id, instituteId, isDeleted: false } });
    if (!record) throw new NotFoundException('<Model> not found');

    await this.prisma.<model>.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });

    try {
      await this.auditLog.record({ instituteId, userId, action: 'DELETE_<MODEL>', targetId: id });
    } catch {}

    return { success: true };
  }
}
```

#### DTOs
```typescript
// create-<module>.dto.ts
export class Create<Module>Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // Add fields per feature design
}

// query-<module>.dto.ts
export class Query<Module>Dto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
```

### Step 6 — Register the module

Add `<Module>Module` to `backend/src/app.module.ts` imports array.

### Step 7 — Run checks

```bash
cd backend && npx tsc --noEmit          # type-check
cd backend && npx prisma validate        # schema valid
```

---

## Checklist

- [ ] Prisma model has `instituteId`, soft delete fields, UUID PK, `@@index([instituteId, isDeleted])`
- [ ] Migration generated and partial indexes added manually in SQL file
- [ ] Controller never reads `instituteId` from body — only from `req.instituteId`
- [ ] Every `findMany`/`findFirst` scoped by `instituteId` AND `isDeleted: false`
- [ ] No `prisma.delete()` anywhere — soft delete only
- [ ] `AuditLogService.record(...)` called inside `try/catch` after every mutation
- [ ] DTOs use `class-validator` with `@MaxLength` matching DB column limits
- [ ] `ValidationPipe` `whitelist: true` strips unknown fields globally (already configured)
- [ ] Module registered in `app.module.ts`
- [ ] Response shape: `{ success, data, meta? }`

---

## Expected Output

```
backend/src/<module>/
  <module>.module.ts          ✅ registered in app.module.ts
  <module>.controller.ts      ✅ guard chain applied, routes scoped
  <module>.service.ts         ✅ instituteId on all queries, audit log on mutations
  dto/create-<module>.dto.ts  ✅ class-validator decorators
  dto/update-<module>.dto.ts  ✅ all fields optional with @IsOptional()
  dto/query-<module>.dto.ts   ✅ page + search params

backend/prisma/schema.prisma  ✅ new model added
backend/prisma/migrations/<timestamp>_add_<module>/
  migration.sql               ✅ includes partial indexes
```
