import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { resolveLatestApproval } from '../../harness/approvals';
import { DappPage } from '../../harness/pages/dapp-page';
import { ApprovePage } from '../../harness/pages/approve-page';

const EVM_ALIAS   = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const CHAIN_ID    = '0x1f440';
const DAPP_ORIGIN = 'http://localhost:3000';
const MESSAGE_HEX = '0x48656c6c6f20453245';                    // "Hello E2E"
const MESSAGE_TXT = 'Hello E2E';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('personal_sign on a tz1 account: popup shows the decoded message, then RelayerProvider rejects with EIP-1193 4200', async ({
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

  await preInject(serviceWorker, {
    vault: testVault,
    sessions: {
      [DAPP_ORIGIN]: {
        origin:      DAPP_ORIGIN,
        tz1Address:  testSeed.expectedTz1,
        evmAlias:    EVM_ALIAS,
        chainId:     CHAIN_ID,
        connectedAt: Date.now(),
      },
    },
  });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const dapp = await DappPage.open(extensionContext);

  const signPromise = dapp.signMsg(MESSAGE_HEX, EVM_ALIAS);

  const approve = await ApprovePage.waitForOpen(extensionContext);
  const body = (await approve.page.textContent('body')) ?? '';

  expect(body).toContain('Signature request');
  expect(body).toContain('Sign message');
  // The wallet's tryDecodeUtf8 turns 0x48656c6c6f20453245 into "Hello E2E"
  // and SignatureView surfaces it as the human-readable payload.
  expect(body).toContain(MESSAGE_TXT);

  // The user *approves* — but the Tezos relayer does not yet support
  // EIP-191 signing for tz1 sources (no secp256k1 key), so handleSign
  // throws EIP1193_UNSUPPORTED_METHOD (4200) and the dApp receives it
  // verbatim. This documents the current contract: approving an
  // unsupported method surfaces the unsupported error rather than a
  // silent no-op.
  await resolveLatestApproval(extensionContext, extensionId, 'approve');

  const result = await signPromise;
  expect(result.ok).toBe(false);
  expect(result.code).toBe(4200);
  expect(result.message).toMatch(/not supported/i);
});
