import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { PopupPage } from '../../harness/pages/popup-page';

const DEST_0X      = '0xdead000000000000000042000000000000000000';
const SCRIPT_BLOCK = '0x100';

function jsonRpc(result: unknown): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
}

test('tz1 → 0x: when the kernel mapping never materialises, the status falls back to unavailable', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  // The L1 send and the balance reads replay from fixtures (copied from 020 —
  // the send is byte-identical). Only the L2 side diverges: the block scan
  // yields no matching tx and every receipt is null, so the synthetic→real
  // resolution never succeeds and the tx-status poller times out into the
  // 'unavailable' stage. This is the AliasForwarder / "mapping never lands"
  // case described in CLAUDE.md §9.
  mock.tezlinkEvm('eth_blockNumber').respond(jsonRpc(SCRIPT_BLOCK));
  mock.tezlinkEvm('eth_getBlockByNumber').respond(jsonRpc({ number: SCRIPT_BLOCK, transactions: [] }));
  mock.tezlinkEvm('eth_getTransactionReceipt').respond(jsonRpc(null));

  // Collapse the otherwise ~2-minute resolution + poll windows so the timeout
  // path runs in seconds. Set on the context so the popup page picks it up
  // before its scripts run; the seam is inert in production (see shared/e2e.ts).
  await extensionContext.addInitScript(() => {
    (globalThis as { __e2e__?: { resolveTimeoutMs?: number; txPollTimeoutMs?: number } }).__e2e__ =
      { resolveTimeoutMs: 1_500, txPollTimeoutMs: 4_000 };
  });

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

  // trackTx runs on the synthetic hash from the moment the send returns, in
  // parallel with the (doomed) resolution loop, so the poller reaches its
  // timeout in ~txPollTimeoutMs regardless of the resolver. The fail banner
  // reads "Status unavailable" — distinct from 021's on-chain revert
  // ("Transaction failed").
  await send.waitForFinalized(20_000);
  const fail = popup.page.locator('.tx-status-fail');
  await expect(fail).toBeVisible();
  await expect(fail).toContainText('Status unavailable');
  await expect(fail).not.toContainText('Transaction failed');
});
