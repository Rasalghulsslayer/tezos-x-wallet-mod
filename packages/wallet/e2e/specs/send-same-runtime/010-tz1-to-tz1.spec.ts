import { test, expect } from '../../harness/fixtures';
import { preInject } from '../../harness/storage';
import { unlockProgrammatically } from '../../harness/unlock';
import { PopupPage } from '../../harness/pages/popup-page';

// A throwaway recipient tz1 — its on-chain state does not matter for a native
// transfer simulation, only the address format does.
const DEST_TZ1 = 'tz1burnburnburnburnburnburnburjAYjjX';

const OP_LEVEL  = 100;
const OP_TIME   = '2026-06-08T12:00:00Z';
const APPLIED   = JSON.stringify([{ level: OP_LEVEL, timestamp: OP_TIME, status: 'applied' }]);

test('tz1 → tz1 native transfer progresses through broadcasting → included → finalized', async ({
  extensionContext,
  serviceWorker,
  extensionId,
  testSeed,
  testVault,
  mock,
}) => {
  // Script the L1 status polling so the test does not depend on real TzKT
  // behaviour (whose `?hash=` filter ignores the parameter on previewnet).
  // First poll: not yet indexed → poller treats as `broadcasting`.
  // Second poll: applied, head = op.level → `included` (0 confirmations).
  // Third poll: applied, head = op.level + finality → `finalized`.
  mock.tzkt('GET /v1/operations/transactions').respondSequence([
    { status: 200, body: '[]' },
    { status: 200, body: APPLIED },
    { status: 200, body: APPLIED },
  ]);
  mock.tzkt('GET /v1/head').respondSequence([
    { status: 200, body: JSON.stringify({ level: OP_LEVEL }) },
    { status: 200, body: JSON.stringify({ level: OP_LEVEL + 2 }) },
  ]);

  await preInject(serviceWorker, { vault: testVault });
  await unlockProgrammatically(extensionContext, extensionId, testSeed.password);

  const popup = await PopupPage.open(extensionContext, extensionId);
  await popup.waitForHome();
  await popup.waitForHeadlineBalanceLoaded();

  const send = await popup.openSend();
  await send.fillRecipient(DEST_TZ1);
  await send.fillAmount('0.001');
  await send.clickReview();
  await send.waitForReview();
  await send.clickConfirm();
  await send.waitForFinalized();

  expect(await send.finalizedStepState()).toBe('done');
});
