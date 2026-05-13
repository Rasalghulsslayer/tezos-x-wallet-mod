import type { PopupRequest, ApproveRequest, WalletResponse } from './messages';

/** Send a typed popup request to the service worker and resolve with its response. */
export async function sendPopupRequest<T = unknown>(msg: PopupRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(msg)) as WalletResponse<T>;
  if (!response.ok) {
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
