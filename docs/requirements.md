# Requirements

## Email Provider

The backend email transport now uses Resend instead of SMTP/Nodemailer.

Current provider details:
- package: `resend`
- auth: `RESEND_API_KEY`
- sender: `Teachly <onboarding@resend.dev>`

This change only affects the transport layer inside `EmailService`.

This does **not** change:
- signup flow
- background job behavior
- retry behavior
- auth flow
- JWT behavior

## Admin Signup Flow (Phase 1)

### Summary

Phase 1 adds a fast validation layer before admin provisioning begins.

This phase does **not** change:
- Supabase provisioning order
- email sending behavior
- feature assignment behavior
- login or JWT behavior

### Fast Validation Added

Before provisioning starts, the backend now validates the admin signup email by:

1. Normalizing the email
   - trim
   - lowercase
2. Checking whether an institute already exists with that email
3. Checking whether a user already exists with that email

### Duplicate Rejection Behavior

If a duplicate is found, signup is rejected immediately with:

- `Institute already exists`
- `User already exists`

This prevents slow provisioning work from starting when the email is already taken locally.

### Flow Status In Phase 1

Current flow after this phase:

`validation -> existing signup provisioning flow`

This means:
- validation is faster
- duplicate failures happen earlier
- the provisioning architecture itself is unchanged in this phase

### Notes

Phase 1 is intentionally limited to early rejection and does not yet introduce:
- transaction-safe local provisioning redesign
- background Supabase provisioning
- async email dispatch
- rollback helpers
- performance optimizations beyond fast duplicate checks

## Admin Signup Flow (Phase 2)

### Summary

Phase 2 makes local admin signup provisioning atomic using a single Prisma transaction.

This phase does **not** change:
- Supabase provisioning order
- email sending behavior
- login or JWT behavior
- auth guards

### Old Behavior

The local signup steps were executed as multiple sequential database writes in the signup flow.

That meant a failure during:
- user creation
- institute feature creation

could leave partial local state such as:
- institute created
- user missing
- feature rows incomplete

### New Behavior

Local admin provisioning now runs through one transaction that includes:

1. create institute
2. create admin user
3. assign admin role through `roleId`
4. create institute features

### Rollback Behavior

If any local database step fails inside the transaction:

- institute creation is rolled back
- user creation is rolled back
- institute feature creation is rolled back

Result:

No partial local signup state remains.

### Flow Status In Phase 2

Current flow after this phase:

`validation -> local atomic provisioning -> existing signup flow`

Supabase provisioning still remains outside the local database transaction in this phase.

## Admin Signup Flow (Phase 3)

### Summary

Phase 3 removes Supabase provisioning from the admin signup request path.

This phase does **not** change:
- JWT behavior
- login behavior
- auth guards
- email sending behavior
- local feature assignment behavior

### Old Behavior

Admin signup waited for Supabase provisioning before the request could finish.

That meant:
- slower signup responses
- external network latency directly affected user experience
- a Supabase delay could hold the entire request open

### New Behavior

Admin signup now completes local work first:

`validation -> local atomic provisioning -> verification email -> response`

After the local user is created, Supabase provisioning runs asynchronously in the background.

### Background Provisioning Status

When background Supabase provisioning is enabled:
- the local user is created with `authMigrationStatus = pending`
- background provisioning attempts to create or link a Supabase auth user
- on success:
  - `supabaseAuthId` is stored
  - `authMigrationStatus = completed`
  - `authMigratedAt` is set
- on failure:
  - the local user remains intact
  - `authMigrationStatus = failed`
  - provisioning can be retried later

### Failure Behavior

If Supabase provisioning fails in the background:

- signup still succeeds
- local institute/user/feature data is not deleted
- the failure is logged with provisioning duration
- the user record is marked for later retry instead of being rolled back

### Flow Status In Phase 3

Current flow after this phase:

`validation -> local atomic provisioning -> verification email -> response -> background Supabase provisioning`

## Admin Signup Flow (Phase 4)

### Summary

Phase 4 removes email sending, institute feature assignment, and signup audit logging from the request path.

This phase does **not** change:
- Supabase background provisioning behavior
- JWT behavior
- login behavior
- auth guards

### Old Behavior

After local admin signup completed, the request still waited for:
- verification email sending
- institute feature creation
- signup audit logging

That meant local DB work was already done, but the response could still be delayed by follow-up operations.

### New Behavior

Admin signup now returns as soon as the core local records are created:

`validation -> local admin provisioning -> response`

Background tasks now handle:
- Supabase provisioning
- verification email sending
- institute feature creation
- signup audit logging

### Local Provisioning Scope

The synchronous local signup transaction now creates only:

1. institute
2. admin user

Feature assignment is now performed asynchronously after the response.

### Failure Behavior

If a background task fails:

- signup still succeeds
- the local institute and admin user remain intact
- email failures are logged only
- feature provisioning failures are logged and can be retried safely later
- audit logging failures do not affect the user-facing response

### Flow Status In Phase 4

Current flow after this phase:

`validation -> local admin provisioning -> response -> background Supabase provisioning + background email + background feature provisioning + background audit logging`

## Admin Signup Flow (Phase 5)

### Summary

Phase 5 adds failure tracking and manual retry support for background admin signup provisioning.

This phase does **not** change:
- signup sequence
- JWT behavior
- login behavior
- auth guards
- queueing model

### Retry Tracking Fields

User records now track provisioning recovery state with:

- `lastMigrationError`
- `migrationRetryCount`
- `lastMigrationAttempt`
- `pendingFeatureIds`

### Failure Recovery Design

When a background task fails:

- the failure is still logged
- retry metadata is stored on the user
- retry count is incremented
- the most recent failure message is persisted
- the last attempt time is updated

### Retry Behavior

A manual retry helper can now re-run unfinished background work for a user:

- Supabase provisioning retry
- feature provisioning retry
- verification email retry

Retries are idempotent:

- Supabase retry links an existing auth user when possible and avoids duplicate local mappings
- feature retry uses `skipDuplicates`
- verification email retry rotates a fresh verification token before sending

### Flow Status In Phase 5

Current flow after this phase:

`validation -> local admin provisioning -> response -> background provisioning tasks`

If background provisioning fails:

`failure logged -> retry metadata stored -> manual retry can safely re-run unfinished tasks`

## Admin Signup Flow (Phase 6)

### Summary

Phase 6 adds operational observability and automatic recovery helpers for background admin signup provisioning.

This phase does **not** change:
- signup sequence
- JWT behavior
- login behavior
- auth guards
- queueing model

### Observability Improvements

Provisioning now exposes a stats helper that reports:

- `totalUsers`
- `pendingProvisioning`
- `completedProvisioning`
- `failedProvisioning`
- `retryCount`
- `successRate`

This gives operations a quick view of how much background provisioning is still pending, how much has completed, and how often retries have been needed.

### Automatic Retry Safety

Background provisioning now supports a bulk retry helper for failed users.

Automatic retry is guarded by:

- maximum 5 retry attempts per user
- minimum 1 hour cooldown between retry attempts

This keeps retries from looping too aggressively while still allowing safe recovery for transient failures.

### Failure Recovery Design

Bulk retry only re-runs the existing idempotent retry helper.

That means:

- Supabase provisioning still links existing auth users safely when possible
- feature provisioning still uses duplicate-safe creation
- verification email retry remains safe to rerun

### Flow Status In Phase 6

Current flow after this phase:

`validation -> local admin provisioning -> response -> background provisioning tasks`

Operational helpers now provide:

`stats visibility -> guarded auto retry -> structured retry logs`
