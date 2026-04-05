import { test, expect } from '@playwright/test';
import { AdminSidebarPOM } from './pages/AdminSidebar';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/settings');
  await page.waitForLoadState('load');
});

test.describe('Settings page', () => {
  test('renders settings page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  });

  test('shows Institute, Features, and My Profile tabs', async ({ page }) => {
    // Tabs are <button> elements (not role="tab")
    await expect(page.getByRole('button', { name: 'Institute' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Features' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My Profile' })).toBeVisible();
  });
});

test.describe('Institute settings', () => {
  test('institute name field is editable', async ({ page }) => {
    // Institute tab is active by default
    // Labels don't use `for` attr — find by first text input
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible' });
    await expect(nameInput).toBeEditable();
  });
});

test.describe('Feature toggles', () => {
  test('feature toggles are displayed', async ({ page }) => {
    await page.getByRole('button', { name: 'Features' }).click();
    await page.waitForLoadState('load');

    // Feature toggles are custom <button class="relative inline-flex h-6 w-11 rounded-full ...">
    const toggles = page.locator('button.inline-flex');
    await toggles.first().waitFor({ state: 'visible' });
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);
  });

  test('toggling a feature updates sidebar visibility', async ({ page }) => {
    const sidebar = new AdminSidebarPOM(page);
    await page.getByRole('button', { name: 'Features' }).click();
    await page.waitForLoadState('load');

    // Wait for toggles to load
    const toggles = page.locator('button.inline-flex');
    await toggles.first().waitFor({ state: 'visible' });

    // Find the Payments row and its toggle (4th feature = index 3)
    const paymentsToggle = page.locator('p', { hasText: 'Payments' }).locator('..').locator('..').locator('button.inline-flex');
    const count = await paymentsToggle.count();
    if (count === 0) { test.skip(); return; }

    const isEnabled = await paymentsToggle.evaluate((el) => el.classList.contains('bg-blue-600'));
    await paymentsToggle.click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(500); // allow sidebar refetch

    if (isEnabled) {
      await sidebar.expectNavHidden('Payments');
    } else {
      await sidebar.expectNavVisible('Payments');
    }

    // Restore
    await paymentsToggle.click();
    await page.waitForLoadState('load');
  });
});

test.describe('Password change validation', () => {
  test('profile tab has password change form', async ({ page }) => {
    await page.getByRole('button', { name: 'My Profile' }).click();
    await page.waitForLoadState('load');

    // Labels don't use `for` — find by input type
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.first().waitFor({ state: 'visible' });
    expect(await passwordInputs.count()).toBeGreaterThanOrEqual(2);
  });

  test('mismatched new passwords show validation error', async ({ page }) => {
    await page.getByRole('button', { name: 'My Profile' }).click();
    await page.waitForLoadState('load');

    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.first().waitFor({ state: 'visible' });

    await pwInputs.nth(0).fill('Test@123');       // Current Password
    await pwInputs.nth(1).fill('NewPass@1');       // New Password
    await pwInputs.nth(2).fill('DifferentPass@2'); // Confirm Password

    await page.getByRole('button', { name: /change password/i }).click();

    const error = page.getByText(/do not match/i);
    await expect(error).toBeVisible({ timeout: 5_000 });
  });
});
