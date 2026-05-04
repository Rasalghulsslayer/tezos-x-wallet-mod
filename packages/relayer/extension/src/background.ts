import type {
  BackgroundRequest,
  BackgroundResponse,
  StoredSession,
} from './messages.js';

const STORAGE_KEY = 'tezosx_sessions';

// ── In-memory state ───────────────────────────────────────────────────────────
//
// The service worker can be killed by Chrome at any time.
// We keep an in-memory cache loaded from chrome.storage.local on startup
// and persist on every modification.

const sessions = new Map<string, StoredSession>();

// Serialize all message handling behind this promise so that a
// SESSION_UPDATE arriving before the storage read completes never overwrites
// previously-stored sessions with an empty Map.
const ready = chrome.storage.local.get(STORAGE_KEY).then((data) => {
  const stored = data[STORAGE_KEY] as Record<string, StoredSession> | undefined;
  if (stored == null) return;
  for (const [origin, session] of Object.entries(stored)) {
    sessions.set(origin, session);
  }
});

// await the chrome.storage.local.set so the SW is not killed mid-write.
async function persist(): Promise<void> {
  const obj: Record<string, StoredSession> = {};
  for (const [origin, session] of sessions) obj[origin] = session;
  await chrome.storage.local.set({ [STORAGE_KEY]: obj });
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    msg: BackgroundRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: BackgroundResponse) => void,
  ): boolean => {

    void ready.then(async () => {
      switch (msg.type) {

        case 'SESSION_UPDATE':
          if (msg.session === null) {
            sessions.delete(msg.origin);
          } else {
            sessions.set(msg.origin, msg.session);
          }
          await persist();
          sendResponse({ type: 'OK' });
          break;

        case 'GET_SESSIONS':
          sendResponse({ type: 'SESSIONS', sessions: Array.from(sessions.values()) });
          break;

        case 'DISCONNECT': {
          sessions.delete(msg.origin);
          await persist();
          sendResponse({ type: 'OK' });

          // Tell the page's content script to propagate the disconnect so
          // the provider actually calls wallet_revokePermissions on the page.
          const tabs = await chrome.tabs.query({ url: msg.origin + '/*' });
          for (const tab of tabs) {
            if (tab.id != null) {
              chrome.tabs.sendMessage(tab.id, { type: 'PAGE_DISCONNECT' }).catch(() => {});
            }
          }
          break;
        }
      }
    });

    return true; // keep message channel open for async sendResponse
  },
);