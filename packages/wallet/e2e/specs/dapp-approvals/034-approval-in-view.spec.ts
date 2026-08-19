import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { DappPage } from '../../harness/pages/dapp-page';
import { PopupPage } from '../../harness/pages/popup-page';

// Derived from the funded test mnemonic in fixtures/vault/seed.json.
const EVM_ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const CHAIN_ID  = '0x1f440';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('approval renders inside an open wallet view — no approve.html window is spawned', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  mock.tezlinkEvm('tez_getTezosEthereumAddress').respond(jsonRpc(EVM_ALIAS));
  mock.tezlinkEvm('eth_chainId').respond(jsonRpc(CHAIN_ID));
  mock.tezlinkEvm('eth_call').respond(jsonRpc('0x' + '0'.repeat(64)));
  mock.michelson(`GET /chains/main/blocks/head/context/contracts/${testSeed.expectedTz1}/balance`).respond({
    status: 200, contentType: 'application/json', body: '"0"',
  });

  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  // Page order matters: the wallet view must be the foreground tab when the
  // request fires — only a visible view counts as an open surface, so a
  // background-tab wallet would (correctly) get the approve.html window.
  const dapp = await DappPage.open(extensionContext);
  const popup = await PopupPage.open(extensionContext, extensionId);
  await popup.waitForHome();

  const connectPromise = dapp.connect();

  // The approval must take over the already-open wallet view.
  const overlay = popup.page.locator('.tx-approval-overlay .tx-approval');
  await overlay.waitFor({ state: 'visible', timeout: 15_000 });

  // …and no approve.html page may have been opened anywhere in the context.
  const approvePages = extensionContext.pages().filter((p) => p.url().includes('approve.html'));
  expect(approvePages).toHaveLength(0);

  await popup.page.getByRole('button', { name: 'Connect' }).click();

  const result = await connectPromise;
  expect(result.ok).toBe(true);
  expect(result.result?.[0].toLowerCase()).toBe(EVM_ALIAS.toLowerCase());

  // Resolving the request clears the in-view overlay (after the done beat).
  await overlay.waitFor({ state: 'hidden', timeout: 10_000 });
});

test('closing the last wallet view rejects the in-view approval', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  mock.tezlinkEvm('tez_getTezosEthereumAddress').respond(jsonRpc(EVM_ALIAS));
  mock.tezlinkEvm('eth_chainId').respond(jsonRpc(CHAIN_ID));
  mock.tezlinkEvm('eth_call').respond(jsonRpc('0x' + '0'.repeat(64)));
  mock.michelson(`GET /chains/main/blocks/head/context/contracts/${testSeed.expectedTz1}/balance`).respond({
    status: 200, contentType: 'application/json', body: '"0"',
  });

  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const dapp = await DappPage.open(extensionContext);
  const popup = await PopupPage.open(extensionContext, extensionId);
  await popup.waitForHome();

  const connectPromise = dapp.connect();

  await popup.page.locator('.tx-approval-overlay .tx-approval').waitFor({ state: 'visible', timeout: 15_000 });

  // Closing the surface that shows the approval = dismissing it, exactly like
  // closing the approve.html window: the dApp gets EIP-1193 4001.
  await popup.page.close();

  const result = await connectPromise;
  expect(result.ok).toBe(false);
  expect(result.code).toBe(4001);
});
