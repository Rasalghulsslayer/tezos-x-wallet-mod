import type { PopupRequest, ApproveRequest, WalletResponse } from '@tezosx/wallet-core/shared/messages';

/** EIP-1193 unauthorised code — the SW returns this when the keyring has no
 *  unlocked entry, typically because the SW restarted (MV3 lifecycle) and lost
 *  its in-memory unlock cache. The popup's UI may still think the wallet is
 *  unlocked from a stale React state. */
const EIP_UNAUTHORIZED = 4100;

/** Custom DOM event the messaging layer dispatches when the SW reports the
 *  session is gone. App listens for it and re-runs GET_STATE which routes the
 *  user back to /unlock. */
export const SW_SESSION_LOST_EVENT = 'tx:sw-session-lost';

/** Requests that legitimately return 4100 without indicating SW death —
 *  excluded so we don't trigger a session-lost re-route in normal flows. */
const SESSION_LOST_EXEMPT: ReadonlySet<PopupRequest['type']> = new Set([
  'GET_STATE',
  'UNLOCK',
]);

function notifySessionLostIfNeeded(code: number, requestType: string): void {
  if (code !== EIP_UNAUTHORIZED) return;
  if (SESSION_LOST_EXEMPT.has(requestType as PopupRequest['type'])) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SW_SESSION_LOST_EVENT));
}

/** Send a typed popup request to the service worker and resolve with its response. */
export async function sendPopupRequest<T = unknown>(msg: PopupRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(msg)) as WalletResponse<T>;
  if (!response.ok) {
    notifySessionLostIfNeeded(response.code, msg.type);
    const err = new Error(response.message) as Error & { code?: number };
    err.code = response.code;
    throw err;
  }
  return response.data as T;
}

/** Same as `sendPopupRequest` but for the approval window. */
export async function sendApproveRequest<T = unknown>(msg: ApproveRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(msg)) as WalletResponse<T>;
  if (!response.ok) {
    const err = new Error(response.message) as Error & { code?: number };
    err.code = response.code;
    throw err;
  }
  return response.data as T;
}
