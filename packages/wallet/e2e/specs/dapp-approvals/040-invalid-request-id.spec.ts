import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';

const EVM_ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const CHAIN_ID  = '0x1f440';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

interface SwResponse {
  ok?:      boolean;
  code?:    number;
  message?: string;
}

test('RESOLVE_PENDING with an unknown requestId is rejected with JSON-RPC -32602', async ({
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

  const page = await extensionContext.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForFunction(() => typeof chrome !== 'undefined' && chrome.runtime != null);

  const response = await page.evaluate(async () =>
    chrome.runtime.sendMessage({
      type:      'RESOLVE_PENDING',
      requestId: 'this-request-id-does-not-exist',
      decision:  'approve',
    }),
  ) as SwResponse;

  expect(response.ok).toBe(false);
  expect(response.code).toBe(-32602);
  expect(response.message).toMatch(/not found/i);
});
