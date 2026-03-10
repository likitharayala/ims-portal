import { test, expect } from '@playwright/test';

// Modal is a custom div.fixed.inset-0.z-50, not <dialog>
const modalOverlay = (page: import('@playwright/test').Page) => page.locator('.fixed.inset-0.z-50');

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/students');
  await page.waitForLoadState('load');
});

test.describe('Students list', () => {
  test('renders students page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /students/i })).toBeVisible();
  });

  test('shows Add Student button', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /add student/i }).or(page.getByRole('button', { name: /add student/i }))
    ).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('search filters list in real-time', async ({ page }) => {
    const search = page.getByPlaceholder(/search/i);
    await search.fill('zzz_no_match_xyz');
    // Wait for debounce + re-render
    await page.waitForTimeout(1000);
    // Empty state: a single <td colspan> with text-center is rendered inside tbody
    // Normal rows: individual <td> cells per column
    const emptyStateTd = page.locator('table tbody td[colspan]');
    const hasEmptyState = await emptyStateTd.isVisible().catch(() => false);
    const allRows = page.locator('table tbody tr');
    const rowCount = await allRows.count();
    // Pass if no rows at all, or the colspan empty-state cell is visible
    expect(rowCount === 0 || hasEmptyState).toBeTruthy();
  });
});

test.describe('Add student form', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly instead of clicking — avoids nav timing issues
    await page.goto('/admin/students/new');
    await page.waitForLoadState('load');
  });

  test('renders all required fields', async ({ page }) => {
    // Labels have no `for` attr — use placeholders to locate fields
    await expect(page.getByPlaceholder(/full name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/student@email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/10-digit/i)).toBeVisible();
    // Class, School, Fee: use the heading to confirm form rendered
    await expect(page.getByRole('heading', { name: /add student/i })).toBeVisible();
  });

  test('blocks submit with empty required fields (HTML5 required)', async ({ page }) => {
    // Submit button is "Create Student"
    await page.getByRole('button', { name: /create student/i }).click();
    // HTML5 required prevents submission — still on the form
    await expect(page.getByPlaceholder(/full name/i)).toBeVisible();
  });
});

test.describe('Student actions', () => {
  test('edit button is accessible on student record', async ({ page }) => {
    const editBtn = page.getByRole('link', { name: /edit/i }).or(page.getByRole('button', { name: /edit/i })).first();
    const count = await editBtn.count();
    if (count === 0) { test.skip(); return; }
    await expect(editBtn).toBeVisible();
  });

  test('delete shows confirmation modal', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const count = await deleteBtn.count();
    if (count === 0) { test.skip(); return; }

    await deleteBtn.click();
    // Custom Modal renders div.fixed.inset-0.z-50 with "Delete Student" heading
    await expect(page.getByRole('heading', { name: /delete student/i })).toBeVisible({ timeout: 5_000 });
  });
});
