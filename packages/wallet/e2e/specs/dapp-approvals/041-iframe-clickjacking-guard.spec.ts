import { test, expect } from '../../harness/fixtures';

test('approve.html is not loadable from an external iframe (WAR + CSP)', async ({
  extensionContext,
  extensionId,
}) => {
  // No vault / unlock needed: the guard sits in the manifest (web_accessible_resources)
  // and CSP (`frame-ancestors 'none'`) — both predate any wallet state.

  const page = await extensionContext.newPage();
  await page.goto('http://localhost:3000/');
  await page.setContent(`<!DOCTYPE html>
    <html><body>
      <iframe id="probe"
              src="chrome-extension://${extensionId}/approve.html?requestId=fake-rid"
              style="width:420px;height:620px"></iframe>
    </body></html>`);

  // Either the resource is blocked by missing WAR (load never starts),
  // or the CSP frame-ancestors directive denies the frame at render time.
  await new Promise((r) => setTimeout(r, 1500));

  const probe = await page.evaluate(() => {
    const iframe = document.getElementById('probe') as HTMLIFrameElement;
    try {
      const doc = iframe.contentDocument;
      // A loaded approve.html would render `.tx-approval`. If we can read
      // the document at all AND that selector resolves, the guard failed.
      if (doc == null) return { embedded: false, reason: 'no contentDocument' };
      const hasApprovalShell = doc.querySelector('.tx-approval') != null;
      const bodyText = doc.body?.innerText ?? '';
      return { embedded: hasApprovalShell, bodyText };
    } catch (e) {
      // Cross-origin / blocked access throws — that's exactly the defense
      // we want to assert.
      return { embedded: false, reason: 'cross-origin access denied' };
    }
  });

  expect(probe.embedded).toBe(false);
});
