import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { loginAsAdmin, loginAsStudent, setupAdminAuth } from './helpers/auth';

const ADMIN_EMAIL = 'lillyjoj1729@gmail.com';
const ADMIN_PASSWORD = 'Test@123';

test.describe('Login page rendering', () => {
  test('renders login form elements', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.getByText('Sign in to your account')).toBeVisible();
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
    await expect(login.forgotPasswordLink).toBeVisible();
  });
});

test.describe('Login validation', () => {
  test('blocks submission with empty fields (HTML5 required)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submitButton.click();
    // HTML5 required prevents submission — URL stays at /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong password causes failed login — stays on /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_EMAIL, 'WrongPassword!');
    // The 401 interceptor (api.ts) redirects window.location.href = '/login'
    // when no refreshToken is present, so the page navigates back to /login
    // instead of showing an inline error. Both behaviors mean login failed.
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('unknown email causes failed login — stays on /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('nobody@nowhere.com', 'Any$123');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Admin login flow', () => {
  test('admin login redirects to /admin/dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('auth persists after page refresh', async ({ page }) => {
    await loginAsAdmin(page);
    await page.reload();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('logout clears session and redirects to /login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test('/admin/* redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Student login flow', () => {
  test('student cannot access admin routes', async ({ page }) => {
    await loginAsStudent(page);
    // If student logged in (not forced change-password), try admin route
    if (page.url().includes('/student/dashboard')) {
      await page.goto('/admin/dashboard');
      await expect(page).not.toHaveURL(/\/admin\/dashboard/);
    } else {
      // On change-password screen — student is logged in as student
      await expect(page).toHaveURL(/\/change-password/);
    }
  });
});

test.describe('Fast-path auth injection', () => {
  test('setupAdminAuth injects tokens and lands on admin page', async ({ page }) => {
    await setupAdminAuth(page);
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});
