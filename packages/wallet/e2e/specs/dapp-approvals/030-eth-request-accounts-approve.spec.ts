import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { resolveLatestApproval } from '../../harness/approvals';
import { DappPage } from '../../harness/pages/dapp-page';

// Derived from the funded test mnemonic in fixtures/vault/seed.json. Hardcoding
// keeps the spec self-contained and makes the assertion explicit.
const EVM_ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const CHAIN_ID  = '0x1f440';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('eth_requestAccounts: user approves → a StoredSession is written and the dApp gets the EVM alias', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  // The wallet's rebuildContainer path calls deriveEvmAlias during UNLOCK, and
  // the eth_requestAccounts handler reads chainId before persisting the
  // StoredSession. Both need to be mocked; the spec doesn't ship RECORDed
  // fixtures of its own.
  mock.tezlinkEvm('tez_getTezosEthereumAddress').respond(jsonRpc(EVM_ALIAS));
  mock.tezlinkEvm('eth_chainId').respond(jsonRpc(CHAIN_ID));
  // The popup's Home will try to read the USDC balance on mount; we don't
  // assert on it, but the call must not abort or it pollutes the test log.
  mock.tezlinkEvm('eth_call').respond(jsonRpc('0x' + '0'.repeat(64)));
  mock.michelson('GET /chains/main/blocks/head/context/contracts/tz1ZTKzWZshji8kW45Tg6WPDX7WVrBnRJ9SH/balance').respond({
    status: 200, contentType: 'application/json', body: '"0"',
  });

  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const dapp = await DappPage.open(extensionContext);

  // Kick off the request — it stays pending until we resolve the approval.
  const connectPromise = dapp.connect();

  // Give the SW enough time to enqueue the pending request, then approve via
  // a transient popup.html page (stable extension context).
  await new Promise((r) => setTimeout(r, 500));
  await resolveLatestApproval(extensionContext, extensionId, 'approve');

  const result = await connectPromise;
  expect(result.ok).toBe(true);
  expect(Array.isArray(result.result)).toBe(true);
  expect(result.result?.length).toBe(1);
  expect(result.result?.[0].toLowerCase()).toBe(EVM_ALIAS.toLowerCase());

  const sessions = await serviceWorker.evaluate(async () => {
    const data = await chrome.storage.local.get('sessions');
    return data.sessions as Record<string, { origin: string; evmAlias: string }> | undefined;
  });
  expect(sessions).toBeDefined();
  expect(sessions?.['http://localhost:3000']).toBeDefined();
  expect(sessions?.['http://localhost:3000'].evmAlias.toLowerCase()).toBe(EVM_ALIAS.toLowerCase());
});
