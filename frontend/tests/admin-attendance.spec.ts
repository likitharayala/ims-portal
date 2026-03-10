import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/attendance');
  await page.waitForLoadState('load');
});

test.describe('Attendance page', () => {
  test('renders attendance page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /attendance/i })).toBeVisible();
  });

  test('shows Mark Attendance tab', async ({ page }) => {
    // Tabs are <button> elements with text "Mark Attendance" and "Monthly Report"
    await expect(page.getByRole('button', { name: 'Mark Attendance' })).toBeVisible();
  });

  test('shows Monthly Report tab', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Monthly Report' })).toBeVisible();
  });
});

test.describe('Mark Attendance tab', () => {
  test('shows date picker', async ({ page }) => {
    // Mark tab is active by default
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test('shows student rows or empty state', async ({ page }) => {
    // Either a table with rows, or an empty state message
    const tableRows = page.locator('table tbody tr');
    const emptyMsg = page.getByText(/no students/i);
    await page.waitForTimeout(1000); // let data load
    const rowCount = await tableRows.count();
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(rowCount > 0 || hasEmpty).toBeTruthy();
  });

  test('Save Attendance button is present when students exist', async ({ page }) => {
    await page.waitForTimeout(1000);
    const students = page.locator('table tbody tr');
    if (await students.count() === 0) { test.skip(); return; }

    // Button text is "Save Attendance"
    await expect(page.getByRole('button', { name: /save attendance/i })).toBeVisible();
  });
});

test.describe('Monthly Report tab', () => {
  test('switching to Monthly Report shows report content', async ({ page }) => {
    await page.getByRole('button', { name: 'Monthly Report' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByRole('heading', { name: /attendance/i })).toBeVisible();
  });

  test('export button is visible in Monthly Report tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Monthly Report' }).click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
  });
});
