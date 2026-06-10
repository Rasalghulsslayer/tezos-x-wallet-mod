import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { PopupPage } from '../../harness/pages/popup-page';

const DEST_0X      = '0xdEAD000000000000000042000000000000000000';
const VALUE_WEI    = '0x38d7ea4c68000';                                  // 0.001 XTZ in wei (1e15)
const SCRIPT_BLOCK = '0x100';
const FINAL_BLOCK  = '0x101';
const REAL_HASH    = `0x${'1234567890abcdef'.repeat(4)}`;
// Alias of the funded test tz1 — the synthesized EVM tx's `from` field. The
// resolver matches kernel-synthesized txs by `tx.from === senderAlias`.
const SENDER_ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('tz1 → 0x cross-runtime transfer resolves synthetic hash and reaches finalized', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  // The L1 side (Taquito forge / preapply / injection / counter / manager_key)
  // comes from recorded fixtures captured against a funded previewnet tz1.
  // The L2 side is scripted below so the test does not depend on kernel
  // synthesis latency, the wallet's 60s pendingResolve window, or the order
  // of trackTx restarts when `done` mutates.

  // Block scan: the wallet calls eth_blockNumber once to snapshot the head,
  // then iterates eth_getBlockByNumber(<hex>, true) from fromBlock..head.
  mock.tezlinkEvm('eth_blockNumber').respond(jsonRpc(SCRIPT_BLOCK));

  // Order matters: the finality probe (`'finalized'` tag) must match a more
  // specific override than the catch-all hex-block scan.
  mock.tezlinkEvm('eth_getBlockByNumber', { firstParam: 'finalized' })
    .respond(jsonRpc({ number: FINAL_BLOCK }));

  mock.tezlinkEvm('eth_getBlockByNumber').respond(jsonRpc({
    number:       SCRIPT_BLOCK,
    transactions: [{
      hash:  REAL_HASH,
      from:  SENDER_ALIAS,
      to:    DEST_0X.toLowerCase(),
      value: VALUE_WEI,
    }],
  }));

  // Receipt: for the resolved real hash, return a success receipt anchored at
  // SCRIPT_BLOCK; for everything else (e.g. the synthetic hash polled before
  // the resolver succeeds) return null.
  mock.tezlinkEvm('eth_getTransactionReceipt', { firstParam: REAL_HASH })
    .respond(jsonRpc({ status: '0x1', blockNumber: SCRIPT_BLOCK }));
  mock.tezlinkEvm('eth_getTransactionReceipt')
    .respond(jsonRpc(null));

  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const popup = await PopupPage.open(extensionContext, extensionId);
  await popup.waitForHome();
  await popup.waitForHeadlineBalanceLoaded();

  const send = await popup.openSend();
  await send.fillRecipient(DEST_0X);
  await send.fillAmount('0.001');
  await send.clickReview();
  await send.waitForReview();
  await send.clickConfirm();
  await send.waitForFinalized(30_000);

  expect(await send.finalizedStepState()).toBe('done');
});
