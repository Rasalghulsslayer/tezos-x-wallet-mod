/**
 * auto-lock: mobile has a single long-lived JS thread, so unlike the extension
 * (which loses its unlocked state when the service worker dies) the decrypted
 * secret would linger in memory. This evicts it on two triggers:
 *   - the app goes to background/inactive (immediate), and
 *   - a foreground inactivity timeout (the screens call touch() on interaction).
 * The caller wires onLock to keyring.lock() (which nulls the in-memory secret).
 */

import { AppState, type AppStateStatus } from 'react-native';

const DEFAULT_IDLE_MS = 5 * 60_000;

export interface AutoLockHandle {
  /** Reset the inactivity timer (call on user interaction). */
  touch(): void;
  /** Detach listeners and cancel the timer. */
  stop(): void;
}

export function startAutoLock(onLock: () => void, idleMs: number = DEFAULT_IDLE_MS): AutoLockHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(onLock, idleMs);
  };
  const disarm = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = undefined;
  };

  const onChange = (status: AppStateStatus): void => {
    if (status === 'background' || status === 'inactive') {
      disarm();
      onLock();
    } else if (status === 'active') {
      arm();
    }
  };

  const subscription = AppState.addEventListener('change', onChange);
  arm();

  return {
    touch: arm,
    stop: () => {
      disarm();
      subscription.remove();
    },
  };
}
