/**
 * approvalUi: the tiny bridge between the platform-neutral ApprovalQueue/
 * ApprovalPresenter (plain classes in core) and the React tree. The mobile
 * presenter writes the currently-pending requestId here; App subscribes and
 * renders the Approve modal for it. This keeps the presenter free of React and
 * lets any component observe the pending approval without prop-drilling.
 *
 * Only one approval is shown at a time (the in-flight dApp request); a second
 * enqueue replaces the visible one. That matches the connect-first scope.
 */

type Listener = () => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export const approvalUi = {
  /** The requestId currently awaiting the user, or null. */
  get(): string | null {
    return current;
  },
  /** Show (requestId) or hide (null) the approval surface; notifies subscribers. */
  set(requestId: string | null): void {
    current = requestId;
    for (const l of listeners) l();
  },
  /** Subscribe to changes; returns an unsubscribe fn (for useSyncExternalStore). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
