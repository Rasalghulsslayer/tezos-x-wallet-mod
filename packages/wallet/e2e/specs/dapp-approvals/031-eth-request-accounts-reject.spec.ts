import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { resolveLatestApproval } from '../../harness/approvals';
import { DappPage } from '../../harness/pages/dapp-page';

const EVM_ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const CHAIN_ID  = '0x1f440';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('eth_requestAccounts: user rejects → dApp receives EIP-1193 code 4001 and no session is stored', async ({
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
  mock.michelson('GET /chains/main/blocks/head/context/contracts/tz1ZTKzWZshji8kW45Tg6WPDX7WVrBnRJ9SH/balance').respond({
    status: 200, contentType: 'application/json', body: '"0"',
  });

  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const dapp = await DappPage.open(extensionContext);

  const connectPromise = dapp.connect();
  await new Promise((r) => setTimeout(r, 500));
  await resolveLatestApproval(extensionContext, extensionId, 'reject');

  const result = await connectPromise;
  expect(result.ok).toBe(false);
  expect(result.code).toBe(4001);

  // No session should have been persisted.
  const sessions = await serviceWorker.evaluate(async () => {
    const data = await chrome.storage.local.get('sessions');
    return (data.sessions ?? {}) as Record<string, unknown>;
  });
  expect(sessions['http://localhost:3000']).toBeUndefined();
});
