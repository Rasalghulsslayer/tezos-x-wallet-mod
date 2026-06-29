/**
 * ApprovalPresenter: shows the approval UI for a pending dApp request and
 * dismisses it. The extension presents a chrome.windows popup (approve.html);
 * a mobile shell presents an in-app modal / navigation screen. The
 * ApprovalQueue owns the decision promise and the pending map; the presenter
 * owns only the surface that asks the user.
 */

/**
 * Opaque handle the presenter returns from `open`, passed back to `close`. The
 * queue stores it without inspecting it (Chrome: a window id; mobile: a screen
 * key). `undefined` is valid when the platform tracks the surface itself.
 */
export type ApprovalHandle = unknown;

export interface ApprovalPresenter {
  /**
   * Present the approval UI for `requestId`. `onDismiss` is invoked if the USER
   * closes the surface without an explicit decision — the queue treats that as a
   * rejection. The returned handle is later passed to `close`.
   */
  open(requestId: string, onDismiss: () => void): Promise<ApprovalHandle>;

  /**
   * Dismiss the approval surface after an explicit decision (or on lock).
   * Idempotent and best-effort: safe to call when the surface is already gone,
   * and must not re-trigger the `onDismiss` passed to `open`.
   */
  close(handle: ApprovalHandle): void;
}
