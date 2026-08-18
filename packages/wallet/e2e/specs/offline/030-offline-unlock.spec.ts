import { test, expect } from '../../harness/fixtures';
import { evictServiceWorker } from '../../harness/extension';
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

  // The acknowledgements are role=checkbox surface rows (tx/Ack), not native inputs.
  const acks = popup.page.getByRole('checkbox');
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

// The account id sealed inside the frozen vault-v2.encrypted.json fixture —
// snapshots are keyed per account, so the pre-injected balances must address it.
const FIXTURE_ACCOUNT_ID = '0aa0c748-de4f-464d-9dd5-d99567eced43';
// Any well-formed alias works: the map is a persisted cache, and offline the
// wallet must render exactly what it persisted (there is no way to re-derive).
const FIXTURE_ALIAS = '0x9c4a708bc27ab52b0f3e2f43a713cbf5b1a9e6d0';
// The Home band's title when the OS still reports a network route but the
// Tezos X endpoints don't answer — which is what Playwright's request-abort
// simulation looks like to navigator.onLine (see hooks/use-online.ts).
const UNREACHABLE_BAND_COPY = "Can't reach the Tezos X network";

test('a warm profile unlocks offline onto cached balances and the persisted alias', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
}) => {
  // A wallet that has been online before: vault + resolved alias + balances
  // snapshot are all on disk, exactly as the alias store and snapshot store
  // persist them.
  await preInject(serviceWorker, {
    vault:   testVault,
    aliases: { [testSeed.expectedTz1]: FIXTURE_ALIAS },
    balancesSnapshots: {
      [FIXTURE_ACCOUNT_ID]: {
        data:      { xtz: '12.5', erc20: {} },
        fetchedAt: Date.now() - 5 * 60_000,
      },
    },
  });

  // The SW hydrates the alias cache once, at boot — on a real warm profile the
  // storage precedes the boot, so evict the SW; the popup's first message
  // respawns it against the injected state (also proving the offline data
  // survives MV3 eviction).
  await evictServiceWorker(extensionContext, serviceWorker);

  const popup = await PopupPage.open(extensionContext, extensionId);
  const password = popup.page.locator('input.tx-input[type="password"]');
  await password.waitFor({ state: 'visible', timeout: 10_000 });
  await password.fill(testSeed.password);
  await popup.page.getByRole('button', { name: 'Unlock' }).click();
  await popup.waitForHome();

  // The cached balance renders — labeled by the offline band — never the
  // failed-fetch placeholder or a fabricated zero.
  await expect(popup.page.getByText(UNREACHABLE_BAND_COPY)).toBeVisible({ timeout: 10_000 });
  expect(await popup.readHeadlineBalance()).toMatch(/^12[.,]50$/);

  // The persisted alias renders as a real address row: hydration made the
  // network-free unlock complete, so the resolving placeholder must not show.
  await expect(popup.page.getByText(RESOLVING_COPY)).toHaveCount(0);
  const shortAlias = `${FIXTURE_ALIAS.slice(0, 8)}…${FIXTURE_ALIAS.slice(-6)}`;
  await expect(popup.page.getByText(shortAlias)).toBeVisible();
  await expect(popup.page.getByText(FATAL_COPY)).toHaveCount(0);
});
