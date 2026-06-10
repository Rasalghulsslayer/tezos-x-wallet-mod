import type { Page } from '@playwright/test';

const RECIPIENT_SELECTOR = '.tx-input.mono';
const AMOUNT_SELECTOR    = '.tx-amount';

export class SendPage {
  constructor(public readonly page: Page) {}

  async waitForForm(): Promise<void> {
    await this.page.locator(AMOUNT_SELECTOR).waitFor({ state: 'visible', timeout: 10_000 });
  }

  async fillRecipient(addr: string): Promise<void> {
    await this.page.locator(RECIPIENT_SELECTOR).first().fill(addr);
  }

  async fillAmount(xtz: string): Promise<void> {
    await this.page.locator(AMOUNT_SELECTOR).first().fill(xtz);
  }

  async clickReview(): Promise<void> {
    await this.page.getByRole('button', { name: 'Review' }).click();
  }

  async waitForReview(): Promise<void> {
    await this.page.getByRole('button', { name: /Confirm.*send/i }).waitFor({ state: 'visible', timeout: 10_000 });
  }

  async clickConfirm(): Promise<void> {
    await this.page.getByRole('button', { name: /Confirm.*send/i }).click();
  }

  /**
   * Wait until the status timeline's third step (`finalized`) reaches the
   * `done` state, or the run ends in failure. The "Finalized" label is in
   * the DOM from the moment the timeline mounts, so we cannot rely on text
   * — we check the `.tx-status-step.done` class on the third step.
   */
  async waitForFinalized(timeoutMs = 60_000): Promise<void> {
    try {
      await this.page.waitForFunction(() => {
        const steps = document.querySelectorAll('.tx-status-step');
        if (steps.length < 3) return false;
        const third = steps[2];
        if (third.classList.contains('done')) return true;
        if (third.classList.contains('failed')) return true;
        if (document.querySelector('.tx-status-fail') != null) return true;
        return false;
      }, { timeout: timeoutMs });
    } catch (e) {
      const snapshot = await this.page.textContent('body').catch(() => '<unreadable>');
      throw new Error(
        `waitForFinalized timed out after ${timeoutMs}ms.\n` +
        `Body text at timeout (first 500 chars):\n${(snapshot ?? '').slice(0, 500)}\n` +
        `Original error: ${(e as Error).message}`,
      );
    }
  }

  /** Returns the state class ('done' | 'active' | 'pending' | 'failed') of the 3rd timeline step. */
  async finalizedStepState(): Promise<string> {
    return this.page.evaluate(() => {
      const steps = document.querySelectorAll('.tx-status-step');
      if (steps.length < 3) return 'missing';
      const c = steps[2].classList;
      if (c.contains('done'))    return 'done';
      if (c.contains('failed'))  return 'failed';
      if (c.contains('active'))  return 'active';
      return 'pending';
    });
  }
}
