import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { PopupPage } from '../../harness/pages/popup-page';

test('home page renders after vault is pre-injected and unlocked', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
}) => {
  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const popup = await PopupPage.open(extensionContext, extensionId);
  await popup.waitForHome();
  await popup.waitForHeadlineBalanceLoaded();

  const balance = await popup.readHeadlineBalance();
  // The fixture stores a mutez balance of "0", so the UI must format it as a
  // numeric value (a string starting with a digit), not the loading placeholder.
  expect(balance).toMatch(/^\d/);
});
