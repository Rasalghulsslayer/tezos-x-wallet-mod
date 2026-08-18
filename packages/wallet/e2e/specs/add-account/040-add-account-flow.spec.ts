import { test, expect } from '../../harness/fixtures';
import { PopupPage } from '../../harness/pages/popup-page';

// The add-account wizard asks one question per screen. This spec locks in the
// two shapes of the flow for a seeded wallet:
//   - the default derived path stays two taps (hero runtime card → Review),
//     with no step dots on the choose screen (it is the router, not a step);
//   - import / fresh live behind the "More ways to add an account" disclosure
//     and walk the full 4-step path (choose → runtime → input → confirm), with
//     kickers and dots projected from the shared core flow VM.
// Every path is a local vault operation — the whole journey runs with the
// network down, so a regression that sneaks an RPC into add-account fails here.
test.use({ networkDown: true });

const PASSWORD = 'add-account-e2e-password';

// Synthetic test-only key (a repeated byte pattern, never a funded account):
// any valid 64-hex scalar exercises the EVM import path.
const EVM_IMPORT_KEY = '0x' + '11'.repeat(32);

/**
 * Onboard a fresh Tezos wallet through the real UI (same flow the offline
 * suite exercises): generate a phrase, confirm the asked words, set a
 * password. Leaves the popup on Home with one account and a wallet seed —
 * the state in which the derived hero must lead the add-account flow.
 */
async function onboardFreshTezosWallet(popup: PopupPage): Promise<void> {
  await popup.page.getByRole('button', { name: 'Create a new wallet' }).click();

  // The acknowledgements are role=checkbox surface rows (tx/Ack), not native inputs.
  const acks = popup.page.getByRole('checkbox');
  await acks.nth(0).check();
  await acks.nth(1).check();
  await popup.page.getByRole('button', { name: 'Generate phrase' }).click();

  await popup.page.getByText('Tap to reveal').click();
  const words = await popup.page.locator('.tx-seed-word .w').allTextContents();
  await popup.page.getByRole('button', { name: "I've written it down" }).click();

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

  await popup.waitForHome();
}

test('derived hero adds account 2 in two taps; the disclosure import path adds account 3', async ({
  extensionContext,
  extensionId,
}) => {
  const popup = await PopupPage.open(extensionContext, extensionId);
  await onboardFreshTezosWallet(popup);

  // ── (a) The choose screen: hero leads, no step math ──
  await popup.page.getByRole('button', { name: 'Add account' }).click();

  await expect(popup.page.getByText('Recommended')).toBeVisible();
  await expect(popup.page.getByText('Next account from your seed phrase')).toBeVisible();
  await expect(popup.page.getByText('Which runtime?')).toBeVisible();
  // The choose screen is the router — the total step count is unknown until a
  // path commits, so it must show neither dots nor a "Step i of n" kicker.
  await expect(popup.page.locator('.tx-dots')).toHaveCount(0);
  await expect(popup.page.getByText(/Step \d+ of \d+/)).toHaveCount(0);

  // ── (b) Derived Michelson path: hero card → Review, two taps total ──
  await popup.page.getByRole('button', { name: 'Michelson account' }).click();

  await expect(popup.page.getByText('Step 2 of 2 · Review')).toBeVisible();
  await expect(popup.page.locator('.tx-dots .d')).toHaveCount(2);
  await popup.page.getByRole('button', { name: 'Derive & activate' }).click();

  await popup.waitForHome();
  // The new account is created AND activated: Home's header shows it, and the
  // switcher pill counts two accounts.
  await expect(popup.page.locator('.tx-account-header .ah-label')).toHaveText('Account 2');
  await expect(popup.page.locator('.ah-switcher .n')).toHaveText('2');

  // ── (c) The disclosure reveals import; the import path walks all 4 steps ──
  await popup.page.getByRole('button', { name: 'Switch account' }).click();
  await popup.page.getByRole('button', { name: 'Add account' }).click();

  await expect(popup.page.getByText('Recommended')).toBeVisible();
  const importRow = popup.page.getByRole('button', { name: 'Import existing keys' });
  await expect(importRow).toBeHidden();
  await popup.page.getByRole('button', { name: 'More ways to add an account' }).click();
  await expect(importRow).toBeVisible();
  await importRow.click();

  await expect(popup.page.getByText('Step 2 of 4 · Choose runtime')).toBeVisible();
  await expect(popup.page.locator('.tx-dots .d')).toHaveCount(4);
  await popup.page.getByRole('button', { name: 'EVM account' }).click();

  await expect(popup.page.getByText('Step 3 of 4 · Paste a secret')).toBeVisible();
  await popup.page.locator('textarea').fill(EVM_IMPORT_KEY);
  await popup.page.getByRole('button', { name: 'Continue' }).click();

  await expect(popup.page.getByText('Step 4 of 4 · Review')).toBeVisible();
  await expect(popup.page.getByText('EVM runtime · 0x')).toBeVisible();
  await popup.page.getByRole('button', { name: 'Import & activate' }).click();

  await popup.waitForHome();
  await expect(popup.page.locator('.tx-account-header .ah-label')).toHaveText('Account 3');
  await expect(popup.page.locator('.ah-switcher .n')).toHaveText('3');
});
