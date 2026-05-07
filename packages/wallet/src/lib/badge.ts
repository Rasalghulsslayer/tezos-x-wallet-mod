import { BADGE_BG_COLOR } from './constants';

/**
 * Set the toolbar icon badge to display a pending-count.
 * Pass 0 to clear. Failures are logged and swallowed — the badge is
 * never critical, the wallet must keep working without it.
 */
export async function setPendingBadge(count: number): Promise<void> {
  try {
    const text = count > 0 ? String(count) : '';
    await chrome.action.setBadgeText({ text });
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG_COLOR });
    }
  } catch (err) {
    console.warn('[TezosX Wallet] badge update failed', err);
  }
}

export const clearPendingBadge = (): Promise<void> => setPendingBadge(0);
