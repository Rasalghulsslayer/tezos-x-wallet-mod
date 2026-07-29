/**
 * ChromeNotificationPort: NotificationPort implementation using
 * chrome.action.setBadgeText and chrome.action.setBadgeBackgroundColor.
 * Failures are logged and swallowed — the toolbar badge is never critical.
 */

import type { NotificationPort } from '@tezosx/wallet-core/ports/notification-port';
import { BADGE_BG_COLOR } from '@tezosx/wallet-core/shared/constants';

export class ChromeNotificationPort implements NotificationPort {
  async setPendingCount(count: number): Promise<void> {
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
}
