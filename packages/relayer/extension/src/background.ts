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

/**
 * The web origin a message came from, or null for the extension's own popup.
 * A content-script message carries a tab and the page URL; a message from an
 * extension page (the popup) has no tab and is treated as trusted first-party
 * UI. Returns undefined when a content-script sender can't be resolved to an
 * origin, which the caller treats as untrusted.
 */
function senderOrigin(
  sender: chrome.runtime.MessageSender,
): string | null | undefined {
  if (sender.tab == null) return null;
  try {
    return new URL(sender.url ?? sender.tab.url ?? '').origin;
  } catch {
    return undefined;
  }
}

chrome.runtime.onMessage.addListener(
  (
    msg: BackgroundRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (r: BackgroundResponse) => void,
  ): boolean => {
    // Only accept messages from this extension's own contexts (content scripts
    // and the popup); anything else — another extension, an unresolved sender —
    // is refused with no response.
    if (sender.id !== chrome.runtime.id) return false;
    const fromOrigin = senderOrigin(sender);
    if (fromOrigin === undefined) return false;

    // A page's content script may only read or mutate the session for its own
    // origin. The popup (fromOrigin === null) is trusted UI and may act on any.
    if (
      fromOrigin !== null &&
      (msg.type === 'SESSION_UPDATE' || msg.type === 'DISCONNECT') &&
      msg.origin !== fromOrigin
    ) {
      return false;
    }

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
          // A content script sees only its own origin's session; the popup
          // sees the full list.
          sendResponse({
            type: 'SESSIONS',
            sessions: fromOrigin === null
              ? Array.from(sessions.values())
              : Array.from(sessions.values()).filter((s) => s.origin === fromOrigin),
          });
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