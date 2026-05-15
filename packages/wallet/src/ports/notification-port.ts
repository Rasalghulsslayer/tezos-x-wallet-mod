/**
 * NotificationPort: toolbar badge setter for the pending dApp request count.
 */

export interface NotificationPort {
  setPendingCount(count: number): Promise<void>;
}
