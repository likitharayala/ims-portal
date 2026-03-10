import type { Page, Locator } from '@playwright/test';

export class AdminSidebarPOM {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  navLink(label: string): Locator {
    return this.page.getByRole('navigation').getByRole('link', { name: label });
  }

  async clickNav(label: string) {
    await this.navLink(label).click();
  }

  async expectNavVisible(label: string) {
    await this.navLink(label).waitFor({ state: 'visible' });
  }

  async expectNavHidden(label: string) {
    await this.navLink(label).waitFor({ state: 'hidden' });
  }

  instituteName(): Locator {
    // The institute name is shown as a small paragraph under the "Teachly" logo
    return this.page.locator('div.px-6.py-5 p.text-xs');
  }

  async clickSignOut() {
    await this.page.getByRole('button', { name: /sign out/i }).click();
  }
}
