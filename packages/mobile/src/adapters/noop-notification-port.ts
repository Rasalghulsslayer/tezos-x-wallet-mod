/**
 * NoopNotificationPort: the extension drives a toolbar badge via this port;
 * mobile has no badge for the unlock+balances milestone. A future version can
 * back this with expo-notifications.
 */

import type { NotificationPort } from '@tezosx/wallet-core/ports/notification-port';

export class NoopNotificationPort implements NotificationPort {
  async setPendingCount(_count: number): Promise<void> {
    // no-op
  }
}
