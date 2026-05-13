/** Generic poll-with-cancel engine. Domain-agnostic. */

export interface PollHandle {
  /** Stop the poller. Idempotent. */
  stop(): void;
}

export interface PollOptions<T> {
  /**
   * Async function called on each tick. Return null to keep polling
   * with the same cadence, return a result to deliver to onUpdate.
   */
  fetch:    () => Promise<T | null>;
  /** Called every time fetch() returns a non-null value. */
  onUpdate: (value: T) => void;
  /** Should the poller stop? Inspect the latest update. */
  isDone:   (value: T) => boolean;
  /** Initial poll interval. May be lengthened via slowDown(). */
  intervalMs: number;
  /** Hard cap on total runtime, ms. */
  timeoutMs:  number;
  /** Optional: called once on timeout. */
  onTimeout?: () => void;
}

export interface PollControl extends PollHandle {
  slowDown(intervalMs: number): void;
}

export function startPoller<T>(opts: PollOptions<T>): PollControl {
  let cancelled = false;
  let interval  = opts.intervalMs;
  let timer:    ReturnType<typeof setTimeout> | null = null;
  const start  = Date.now();

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    if (Date.now() - start > opts.timeoutMs) {
      opts.onTimeout?.();
      return;
    }

    let value: T | null = null;
    try {
      value = await opts.fetch();
    } catch (err) {
      console.warn('[poller] fetch error', err);
    }

    if (cancelled) return;

    if (value !== null) {
      opts.onUpdate(value);
      if (opts.isDone(value)) return;
    }

    timer = setTimeout(() => { void tick(); }, interval);
  };

  void tick();

  return {
    stop() {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    },
    slowDown(ms: number) { interval = ms; },
  };
}
