import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { PopupPage } from '../../harness/pages/popup-page';

// The wallet must stay fully usable on a machine with no internet access:
// onboarding, lock/unlock and popup routing are local vault operations, and
// only the network-derived data degrades — the balance shows its placeholder
// with a failure toast, and the EVM alias row shows the resolving placeholder
// until the background backfill can reach the node again. Every other spec
// ships a recorded response for each RPC the flow makes, so a regression that
// silently gates unlock or state reads on the network is only caught here.
test.use({ networkDown: true });

const PASSWORD = 'offline-e2e-password';

const BALANCE_PLACEHOLDER = '—';
// Stable product strings asserted below (see AccountHeader / error.ts / Unlock).
const RESOLVING_COPY      = 'Resolving EVM address';
const FATAL_COPY          = "can't reach its service worker";

/**
 * Home in its offline-degraded shape: rendered, with the balance placeholder
 * (never a fabricated "0") and the EVM alias still resolving. The failed
 * balance fetch surfaces as a danger toast — waiting for it also guarantees
 * the fetch has settled before the placeholder is read, so a late flip to a
 * numeric value cannot slip through.
 */
async function expectHomeDegradedOffline(popup: PopupPage): Promise<void> {
  await popup.waitForHome();
  await expect(popup.page.locator('.tx-toast-danger')).toBeVisible({ timeout: 10_000 });
  expect(await popup.readHeadlineBalance()).toBe(BALANCE_PLACEHOLDER);
  await expect(popup.page.getByText(RESOLVING_COPY)).toBeVisible();
  await expect(popup.page.getByText(FATAL_COPY)).toHaveCount(0);
}

test('creating a wallet, relocking and reopening the popup all work offline', async ({
  extensionContext,
  extensionId,
}) => {
  const popup = await PopupPage.open(extensionContext, extensionId);

  // ── Onboarding through the real UI, network down from the very start ──
  await popup.page.getByRole('button', { name: 'Create a new wallet' }).click();

  const acks = popup.page.locator('input[type="checkbox"]');
  await acks.nth(0).check();
  await acks.nth(1).check();
  await popup.page.getByRole('button', { name: 'Generate phrase' }).click();

  await popup.page.getByText('Tap to reveal').click();
  const words = await popup.page.locator('.tx-seed-word .w').allTextContents();
  await popup.page.getByRole('button', { name: "I've written it down" }).click();

  // Confirm stage: type the words the page asks for by position.
  const labels = popup.page.locator('.tx-field-label');
  const inputs = popup.page.locator('input.tx-input.mono');
  await labels.first().waitFor({ state: 'visible' });
  const labelCount = await labels.count();
  for (let i = 0; i < labelCount; i++) {
    const label = (await labels.nth(i).textContent()) ?? '';
    const m = /#(\d+)/.exec(label);
    if (m == null) throw new Error(`Unexpected confirm-stage label: "${label}"`);
    await inputs.nth(i).fill(words[Number(m[1]) - 1]);
  }
  await popup.page.getByRole('button', { name: 'Continue' }).click();

  const pwFields = popup.page.locator('input.tx-input[type="password"]');
  await pwFields.nth(0).fill(PASSWORD);
  await pwFields.nth(1).fill(PASSWORD);
  await popup.page.getByRole('button', { name: 'Open wallet' }).click();

  await expectHomeDegradedOffline(popup);

  // ── Lock via the UI, then unlock with the password — still no network ──
  await popup.page.getByRole('button', { name: 'Lock' }).click();
  await expect(popup.page.getByText('Welcome back')).toBeVisible();

  await popup.page.locator('input.tx-input[type="password"]').fill(PASSWORD);
  await popup.page.getByRole('button', { name: 'Unlock' }).click();

  // Reaching Home proves the unlock did not fall into the form's error path
  // (which stays on the Unlock page); the inline-error absence pins it down.
  await popup.waitForHome();
  await expect(popup.page.locator('.tx-err-inline')).toHaveCount(0);
  await expect(popup.page.getByText('Incorrect password')).toHaveCount(0);

  // ── Close and reopen the popup while unlocked ──
  await popup.page.close();
  const reopened = await PopupPage.open(extensionContext, extensionId);
  await reopened.waitForHome();
  await expect(reopened.page.getByText(FATAL_COPY)).toHaveCount(0);
  await expect(reopened.page.getByText('Welcome back')).toHaveCount(0);
});

test('a returning user unlocks an existing vault via the password form while offline', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
}) => {
  // The vault exists but was sealed elsewhere: unlock is the first thing this
  // session does, and it must be a purely local decrypt.
  await preInject(serviceWorker, { vault: testVault });

  const popup = await PopupPage.open(extensionContext, extensionId);
  const password = popup.page.locator('input.tx-input[type="password"]');
  await password.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(popup.page.getByText('Welcome back')).toBeVisible();

  await password.fill(testSeed.password);
  await popup.page.getByRole('button', { name: 'Unlock' }).click();

  await expectHomeDegradedOffline(popup);
  await expect(popup.page.locator('.tx-err-inline')).toHaveCount(0);
  await expect(popup.page.getByText('Incorrect password')).toHaveCount(0);
});
