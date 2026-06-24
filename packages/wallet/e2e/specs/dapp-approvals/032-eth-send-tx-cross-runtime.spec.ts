import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { resolveLatestApproval } from '../../harness/approvals';
import { DappPage } from '../../harness/pages/dapp-page';
import { ApprovePage } from '../../harness/pages/approve-page';

const EVM_ALIAS  = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const CHAIN_ID   = '0x1f440';
const DAPP_ORIGIN = 'http://localhost:3000';
const DEST_0X    = '0xdEAD000000000000000042000000000000000000';
const VALUE_WEI  = '0x38d7ea4c68000';                        // 1000 mutez (0.001 XTZ)
const NAC_KT1    = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('eth_sendTransaction (tz1 source): approval popup shows the NAC gateway crossRuntime block', async ({
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

  // Pre-inject a session for the test dApp origin — eth_sendTransaction is
  // gated behind a connected origin and we don't want to also exercise the
  // connect flow here (it's covered by 030).
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

  const sendPromise = dapp.sendTx({ from: EVM_ALIAS, to: DEST_0X, value: VALUE_WEI });

  const approve = await ApprovePage.waitForOpen(extensionContext);
  const body = (await approve.page.textContent('body')) ?? '';

  expect(body).toContain('Transaction request');
  // The crossRuntime block surfaces what the user is *actually* signing
  // (Michelson L1 op against the NAC gateway) versus what the dApp asked
  // for. Both must be visible.
  expect(body).toContain('Michelson target');
  expect(body).toContain('Entrypoint');
  expect(body).toContain('Debit (mutez)');
  expect(body).toContain('1000');                    // 0.001 XTZ → 1000 mutez
  expect(body).toContain(NAC_KT1.slice(0, 6));       // truncated KT1 address
  expect(body).toContain('call');                    // bare-transfer entrypoint (HTTP %call; %default removed in !22168)

  // Reject ends the flow without firing the Taquito sign+inject path
  // (already covered by spec 020). The dApp must receive EIP-1193 4001.
  await resolveLatestApproval(extensionContext, extensionId, 'reject');

  const result = await sendPromise;
  expect(result.ok).toBe(false);
  expect(result.code).toBe(4001);
});
