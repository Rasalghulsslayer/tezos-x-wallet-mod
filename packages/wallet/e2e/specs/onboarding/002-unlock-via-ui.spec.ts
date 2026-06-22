import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { PopupPage } from '../../harness/pages/popup-page';

// The only spec that exercises the real Unlock form. Every other spec unlocks
// programmatically (a direct UNLOCK message to the SW); this one drives the
// password input and button the way a returning user does, so a regression in
// the locked → Unlock → Home routing or in the form wiring is caught.
test('unlocking via the UI password form lands on Home', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
}) => {
  // Pre-inject the encrypted vault but do NOT unlock — the Gate must route the
  // locked state to the Unlock page.
  await preInject(serviceWorker, { vault: testVault });

  const popup = await PopupPage.open(extensionContext, extensionId);

  const password = popup.page.locator('input.tx-input[type="password"]');
  await password.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(popup.page.getByText('Welcome back')).toBeVisible();

  await password.fill(testSeed.password);
  await popup.page.getByRole('button', { name: 'Unlock' }).click();

  await popup.waitForHome();
  await popup.waitForHeadlineBalanceLoaded();
});

test('a wrong password is rejected inline and stays on the Unlock page', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testVault,
}) => {
  await preInject(serviceWorker, { vault: testVault });

  const popup = await PopupPage.open(extensionContext, extensionId);
  const password = popup.page.locator('input.tx-input[type="password"]');
  await password.waitFor({ state: 'visible', timeout: 10_000 });

  await password.fill('definitely-not-the-password');
  await popup.page.getByRole('button', { name: 'Unlock' }).click();

  // The form surfaces an inline error and the password field is cleared; the
  // Home balance never appears.
  await expect(popup.page.locator('.tx-home-balance')).toHaveCount(0);
  await expect(password).toBeVisible();
});
