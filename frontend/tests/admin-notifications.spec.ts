import { test, expect } from '@playwright/test';

// Modal is a custom div.fixed.inset-0.z-50, not <dialog>
const modalOverlay = (page: import('@playwright/test').Page) => page.locator('.fixed.inset-0.z-50');

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/notifications');
  await page.waitForLoadState('load');
});

test.describe('Notifications page', () => {
  test('renders notifications page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();
  });

  test('shows Send Notification button', async ({ page }) => {
    // Button text is "+ Send Notification"
    await expect(page.getByRole('button', { name: /send notification/i })).toBeVisible();
  });
});

test.describe('Create notification', () => {
  test('opens notification modal', async ({ page }) => {
    await page.getByRole('button', { name: /send notification/i }).click();
    await expect(modalOverlay(page)).toBeVisible({ timeout: 5_000 });
  });

  test('form has Title and Message fields', async ({ page }) => {
    await page.getByRole('button', { name: /send notification/i }).click();
    await modalOverlay(page).waitFor({ state: 'visible' });

    // Labels are plain text, no `for` attr. Find by placeholder or position.
    await expect(page.getByPlaceholder(/holiday notice/i)).toBeVisible();
    await expect(page.getByPlaceholder(/write your message/i)).toBeVisible();
  });

  test('creates a notification and it appears in the list', async ({ page }) => {
    await page.getByRole('button', { name: /send notification/i }).click();
    await modalOverlay(page).waitFor({ state: 'visible' });

    const uniqueTitle = `E2E Test ${Date.now()}`;
    await page.getByPlaceholder(/holiday notice/i).fill(uniqueTitle);
    await page.getByPlaceholder(/write your message/i).fill('Automated E2E test message.');

    await page.getByRole('button', { name: /^send$/i }).click();

    await modalOverlay(page).waitFor({ state: 'hidden', timeout: 10_000 });
    await page.waitForLoadState('load');

    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Delete notification', () => {
  test('delete button shows confirmation modal', async ({ page }) => {
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const count = await deleteBtn.count();
    if (count === 0) { test.skip(); return; }

    await deleteBtn.click();
    // Confirmation modal contains "Delete Notification" heading
    await expect(page.getByRole('heading', { name: /delete notification/i })).toBeVisible({ timeout: 5_000 });
  });
});
