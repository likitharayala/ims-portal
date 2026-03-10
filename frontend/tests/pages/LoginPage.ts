import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    // Labels have no `for` attr — use placeholder selectors
    this.emailInput = page.getByPlaceholder('your@email.com');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    this.errorMessage = page.locator('.bg-red-50');
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(emailOrPhone: string, password: string) {
    await this.emailInput.fill(emailOrPhone);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(text: string) {
    await this.errorMessage.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      (t) => document.querySelector('.bg-red-50')?.textContent?.includes(t),
      text,
    );
  }
}
