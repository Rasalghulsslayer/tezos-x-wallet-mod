/**
 * ApprovalOverlay — in-view host for dApp approvals. Mounted once by App, it
 * opens the long-lived UI port (which is also what tells the SW a wallet view
 * is on screen) and re-reads LIST_PENDING on every PENDING_CHANGED push.
 * While a request is pending it renders ApprovalPanel as a full-view takeover
 * above the router — the same body approve.html shows in a window when no
 * view is open. One approval shows at a time; resolving one advances to the
 * next. A panel that is mid-resolution (signing → done) stays mounted until
 * it closes itself, even though the request has already left the queue.
 *
 * Two guards mirror the windowed surface's posture: the overlay never renders
 * inside a frame (same last-line defense as approve-main), and it ignores
 * pointer input for its first moments on screen so a dApp can't time a
 * request to capture a click the user aimed at the wallet UI underneath.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';
import { sendPopupRequest } from '../shared/messaging';
import { connectUiPort } from '../adapters/chrome/ui-port-client';
import { ApprovalPanel } from './pages/Approve';
import { ExperimentalBanner } from './tx/ExperimentalBanner';

const ARM_DELAY_MS = 500;

export function ApprovalOverlay() {
  const framed = window.top !== window;
  const [shownId, setShownId] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    let list: PendingRequest[] = [];
    try {
      list = await sendPopupRequest<PendingRequest[]>({ type: 'LIST_PENDING' });
    } catch {
      // SW unreachable — leave the overlay as-is; the next push retries.
      return;
    }
    setShownId((prev) => {
      if (prev != null && busyRef.current) return prev;
      if (prev != null && list.some((p) => p.requestId === prev)) return prev;
      return list.length > 0 ? list[list.length - 1].requestId : null;
    });
  }, []);

  useEffect(() => {
    if (framed) return;
    const disconnect = connectUiPort(() => { void refresh(); });
    void refresh();
    return disconnect;
  }, [framed, refresh]);

  useEffect(() => {
    if (shownId == null) return;
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shownId]);

  const closeShown = useCallback(() => {
    busyRef.current = false;
    setShownId(null);
    void refresh();
  }, [refresh]);

  if (framed || shownId == null) return null;
  return (
    <div className={`tx-approval-overlay${armed ? '' : ' arming'}`}>
      <ExperimentalBanner />
      <ApprovalPanel
        key={shownId}
        requestId={shownId}
        onClose={closeShown}
        onBusyChange={(busy) => { busyRef.current = busy; }}
      />
    </div>
  );
}
