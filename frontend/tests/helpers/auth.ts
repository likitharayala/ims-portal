import type { Page } from '@playwright/test';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api/v1';

const ADMIN_EMAIL = 'lillyjoj1729@gmail.com';
const ADMIN_PASSWORD = 'Test@123';
const STUDENT_EMAIL = 'att.student@test.com';
const STUDENT_PASSWORD = 'StudentAtt@1';

/**
 * Full UI login — navigates to /login and submits credentials.
 * Use in auth.spec.ts where the login UI itself is under test.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  // Labels have no `for` attr — use placeholder selectors
  await page.getByPlaceholder('your@email.com').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/dashboard/);
}

export async function loginAsStudent(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('your@email.com').fill(STUDENT_EMAIL);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Students may need to change password on first login
  await page.waitForURL(/\/(student\/dashboard|change-password)/);
}

/**
 * Fast-path: calls backend API from Node to get real JWT,
 * injects into localStorage + sets cookies so the app skips the login page.
 * Cannot use hardcoded tokens — backend compares session_id vs DB on every request.
 */
export async function setupAdminAuth(page: Page) {
  const { data } = await axios.post(`${API_BASE}/auth/login`, {
    emailOrPhone: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  const { accessToken, refreshToken, user } = data.data;

  await page.goto('/login'); // need a page load before localStorage access
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    },
    { accessToken, refreshToken, user },
  );

  await page.context().addCookies([
    {
      name: 'accessToken',
      value: accessToken,
      domain: 'localhost',
      path: '/',
      maxAge: 900,
    },
    {
      name: 'userRole',
      value: user.role,
      domain: 'localhost',
      path: '/',
      maxAge: 604800,
    },
  ]);
}

export async function setupStudentAuth(page: Page) {
  const { data } = await axios.post(`${API_BASE}/auth/login`, {
    emailOrPhone: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });

  const { accessToken, refreshToken, user } = data.data;

  await page.goto('/login');
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    },
    { accessToken, refreshToken, user },
  );

  await page.context().addCookies([
    {
      name: 'accessToken',
      value: accessToken,
      domain: 'localhost',
      path: '/',
      maxAge: 900,
    },
    {
      name: 'userRole',
      value: user.role,
      domain: 'localhost',
      path: '/',
      maxAge: 604800,
    },
  ]);
}
