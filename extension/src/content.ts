import type { SessionUpdateMessage, BackgroundRequest } from './messages.js';

// ── Pont page → background (notifications de session) ────────────────────────
//
// injected.ts est désormais déclaré world:"MAIN" dans le manifest : le
// navigateur l'injecte lui-même de façon synchrone, avant tout script de la
// page. Ce content script (world:"ISOLATED") se charge uniquement de relayer
// les changements de session vers le background pour affichage dans le popup.

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;

  const msg = event.data as Partial<SessionUpdateMessage>;
  if (msg?.type !== 'TEZOSX_SESSION_UPDATE') return;

  const trustedOrigin = window.location.origin;

  const req: BackgroundRequest = msg.session != null
    ? {
        type:    'SESSION_UPDATE',
        session: { ...msg.session, origin: trustedOrigin, connectedAt: Date.now() },
        origin:  trustedOrigin,
      }
    : { type: 'SESSION_UPDATE', session: null, origin: trustedOrigin };

  chrome.runtime.sendMessage(req).catch(() => {
    // Background may not be ready yet on first load — ignore silently.
  });
});

chrome.runtime.onMessage.addListener((msg: { type: string }) => {
  if (msg?.type === 'PAGE_DISCONNECT') {
    window.postMessage({ type: 'TEZOSX_DISCONNECT' }, window.location.origin);
  }
});
