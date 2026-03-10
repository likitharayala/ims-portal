import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2, // limited to avoid rate-limiting the backend
  timeout: 30_000,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    // Auth spec — no stored state, tests the login UI itself.
    // Runs AFTER admin+student to avoid overwriting the shared session_id
    // (single-active-session: any login invalidates the previous JWT).
    {
      name: 'auth',
      testMatch: '**/auth.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['admin', 'student'],
    },
    // Admin specs — reuse the admin session saved by globalSetup
    {
      name: 'admin',
      testMatch: '**/admin-*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/admin.json',
      },
    },
    // Student spec — reuse the student session saved by globalSetup
    {
      name: 'student',
      testMatch: '**/student-flows.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/student.json',
      },
    },
  ],
  // No webServer block — both servers assumed already running
});
