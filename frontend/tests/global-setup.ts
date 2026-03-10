import { chromium } from '@playwright/test';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3001/api/v1';

async function loginWithRetry(credentials: { emailOrPhone: string; password: string }) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const { data } = await axios.post(`${API_BASE}/auth/login`, credentials);
      return data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 429 && attempt < 5) {
        const wait = attempt * 15_000; // 15s, 30s, 45s, 60s
        console.log(`[global-setup] 429 on attempt ${attempt}, waiting ${wait / 1000}s…`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

async function saveStorageState(
  browser: import('@playwright/test').Browser,
  accessToken: string,
  refreshToken: string,
  user: Record<string, unknown>,
  filePath: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:3000/login');

  await page.evaluate(
    ({ at, rt, u }) => {
      localStorage.setItem('accessToken', at);
      localStorage.setItem('refreshToken', rt);
      localStorage.setItem('user', JSON.stringify(u));
    },
    { at: accessToken, rt: refreshToken, u: user },
  );

  await context.addCookies([
    {
      name: 'accessToken',
      value: accessToken,
      domain: 'localhost',
      path: '/',
      maxAge: 900,
    },
    {
      name: 'userRole',
      value: user.role as string,
      domain: 'localhost',
      path: '/',
      maxAge: 604800,
    },
  ]);

  await context.storageState({ path: filePath });
  await context.close();
}

export default async function globalSetup() {
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();

  // --- Admin ---
  const adminData = await loginWithRetry({ emailOrPhone: 'lillyjoj1729@gmail.com', password: 'Test@123' });
  const { accessToken: at, refreshToken: rt, user: adminUser } = adminData.data;
  await saveStorageState(browser, at, rt, adminUser, path.join(authDir, 'admin.json'));
  console.log('[global-setup] Admin auth saved');

  // Small delay to avoid rate-limit on the second login
  await new Promise((r) => setTimeout(r, 1000));

  // --- Student ---
  try {
    const studentData = await loginWithRetry({ emailOrPhone: 'att.student@test.com', password: 'StudentAtt@1' });
    const { accessToken: sat, refreshToken: srt, user: studentUser } = studentData.data;
    await saveStorageState(browser, sat, srt, studentUser, path.join(authDir, 'student.json'));
    console.log('[global-setup] Student auth saved');
  } catch (e: unknown) {
    // Student account may require password change — write empty state so tests can skip gracefully
    console.warn('[global-setup] Student login failed (may need password change):', (e as Error).message);
    fs.writeFileSync(
      path.join(authDir, 'student.json'),
      JSON.stringify({ cookies: [], origins: [] }),
    );
  }

  await browser.close();
}
