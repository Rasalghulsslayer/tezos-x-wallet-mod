import type { BrowserContext, Page } from '@playwright/test';
import { SendPage } from './send-page';

const HEADLINE_BALANCE_SELECTOR = '.tx-home-balance .num > span';
const PLACEHOLDER = '—';

export class PopupPage {
  private constructor(public readonly page: Page) {}

  static async open(context: BrowserContext, extensionId: string): Promise<PopupPage> {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    return new PopupPage(page);
  }

  async waitForHome(): Promise<void> {
    await this.page.locator('.tx-home-balance').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async openSend(): Promise<SendPage> {
    await this.page.getByRole('button', { name: 'Send' }).first().click();
    const send = new SendPage(this.page);
    await send.waitForForm();
    return send;
  }

  /** Wait until the headline balance has moved off the loading placeholder. */
  async waitForHeadlineBalanceLoaded(timeoutMs = 15_000): Promise<void> {
    await this.page.waitForFunction(
      ({ selector, placeholder }) => {
        const el = document.querySelector(selector);
        if (el == null || el.textContent == null) return false;
        return el.textContent.trim() !== placeholder;
      },
      { selector: HEADLINE_BALANCE_SELECTOR, placeholder: PLACEHOLDER },
      { timeout: timeoutMs },
    );
  }

  /** Block until the popup has settled all in-flight requests. */
  async waitForNetworkIdle(timeoutMs = 10_000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: timeoutMs });
  }

  async readHeadlineBalance(): Promise<string> {
    const node = this.page.locator(HEADLINE_BALANCE_SELECTOR).first();
    await node.waitFor({ state: 'visible', timeout: 15_000 });
    return (await node.textContent())?.trim() ?? '';
  }
}
