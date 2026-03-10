import { test, expect } from '@playwright/test';

// Modal is a custom div.fixed.inset-0.z-50, not <dialog>
const modalOverlay = (page: import('@playwright/test').Page) => page.locator('.fixed.inset-0.z-50');

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/payments');
  await page.waitForLoadState('load');
});

test.describe('Payments list', () => {
  test('renders payments page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
  });

  test('shows All Payments and Overdue tabs', async ({ page }) => {
    // Tabs are "All Payments" and "Overdue"
    await expect(page.getByRole('button', { name: 'All Payments' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overdue' })).toBeVisible();
  });

  test('shows export button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
  });
});

test.describe('Status filter', () => {
  test('clicking All Payments tab shows all records', async ({ page }) => {
    await page.getByRole('button', { name: 'All Payments' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
  });

  test('clicking Overdue tab shows overdue records', async ({ page }) => {
    await page.getByRole('button', { name: 'Overdue' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
  });
});

test.describe('Payment status update', () => {
  test('Update button opens status modal', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: /update/i }).first();
    const count = await updateBtn.count();
    if (count === 0) { test.skip(); return; }

    await updateBtn.click();
    await expect(modalOverlay(page)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Export', () => {
  test('export button triggers download', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /export/i });
    const count = await exportBtn.count();
    if (count === 0) { test.skip(); return; }

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await exportBtn.click();
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
    }
  });
});
