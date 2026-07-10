import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { PopupPage } from '../../harness/pages/popup-page';

const DEST_0X      = '0xdead000000000000000042000000000000000000';
const VALUE_WEI    = '0x38d7ea4c68000';
const SCRIPT_BLOCK = '0x100';
const REAL_HASH    = `0x${'1234567890abcdef'.repeat(4)}`;
const SENDER_ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('tz1 → 0x: a reverted L2 receipt surfaces the failure card', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  // The L1 path replays the same Michelson fixtures captured for 020 — the
  // send and its synthetic hash are identical. Only the L2 polling diverges:
  // the receipt comes back with `status: '0x0'` (kernel reverted the
  // synthesized EVM tx), and the wallet must surface that as a failure.

  mock.tezlinkEvm('eth_blockNumber').respond(jsonRpc(SCRIPT_BLOCK));

  mock.tezlinkEvm('eth_getBlockByNumber', { firstParam: 'finalized' })
    .respond(jsonRpc({ number: SCRIPT_BLOCK }));

  mock.tezlinkEvm('eth_getBlockByNumber').respond(jsonRpc({
    number:       SCRIPT_BLOCK,
    transactions: [{
      hash:  REAL_HASH,
      from:  SENDER_ALIAS,
      to:    DEST_0X.toLowerCase(),
      value: VALUE_WEI,
    }],
  }));

  mock.tezlinkEvm('eth_getTransactionReceipt', { firstParam: REAL_HASH })
    .respond(jsonRpc({ status: '0x0', blockNumber: SCRIPT_BLOCK }));
  mock.tezlinkEvm('eth_getTransactionReceipt').respond(jsonRpc(null));

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

  // When the L2 receipt reports a revert, StatusTimeline marks the `included`
  // step (idx 1) as `failed` and leaves `finalized` (idx 2) as `pending`. The
  // user-facing signal is the `.tx-status-fail` banner — that's what we assert.
  await expect(popup.page.locator('.tx-status-fail')).toBeVisible();
  await expect(popup.page.locator('.tx-status-fail')).toContainText('Transaction failed');
});
