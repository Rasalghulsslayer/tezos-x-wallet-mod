import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export interface ToastPayload {
  message:    string;
  /** Greyed secondary tag like "· network" — same line, --tx-fg-muted. */
  secondary?: string;
  variant?:   'success' | 'danger';
  /** Sticky toast: no auto-dismiss, shows a close button. */
  sticky?:    boolean;
  /** Optional retry handler — renders a "Retry" button. */
  retry?:     () => void;
}

type Listener = (payload: ToastPayload | null) => void;
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | undefined;

const AUTO_DISMISS_MS   = 5_000;
const QUICK_DISMISS_MS  = 1_600;   // confirmation blips (copied, saved)

function emit(payload: ToastPayload | null): void {
  listeners.forEach((l) => l(payload));
}

/** Success toast (existing API — string in, auto-dismiss). */
export function toast(message: string): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
  emit({ message, variant: 'success' });
  hideTimer = setTimeout(() => emit(null), QUICK_DISMISS_MS);
}

/** Danger toast — pass options. Auto-dismiss unless `sticky` is set. */
export function errorToast(payload: Omit<ToastPayload, 'variant'>): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
  emit({ ...payload, variant: 'danger' });
  if (!payload.sticky) {
    hideTimer = setTimeout(() => emit(null), AUTO_DISMISS_MS);
  }
}

/** Programmatically dismiss any visible toast. */
export function dismissToast(): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
  emit(null);
}

export function ToastHost() {
  const [payload, setPayload] = useState<ToastPayload | null>(null);
  useEffect(() => {
    listeners.add(setPayload);
    return () => { listeners.delete(setPayload); };
  }, []);

  if (payload == null) return null;
  const { variant = 'success', message, secondary, sticky, retry } = payload;

  if (variant === 'success') {
    return (
      <div className="tx-toast-wrap">
        <div className="tx-toast">
          <Icon name="check" size={14} color="var(--tx-fg-inverted)" />
          {message}
        </div>
      </div>
    );
  }

  return (
    <div className="tx-toast-wrap">
      <div
        className={`tx-toast-danger${sticky ? '' : ' has-progress'}`}
        role={sticky ? 'alert' : 'status'}
        aria-live={sticky ? 'assertive' : 'polite'}
      >
        <span className="tx-toast-ico" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 4v3.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="7" cy="9.75" r="0.7" fill="currentColor" />
          </svg>
        </span>
        <div className="tx-toast-msg">
          {message}
          {secondary && <span className="tx-toast-secondary"> {secondary}</span>}
        </div>
        {retry && (
          <button type="button" className="tx-toast-action" onClick={retry}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M10 5.5A4 4 0 1 1 8.5 2.7M10 2v2.5H7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Retry
          </button>
        )}
        {sticky && (
          <button type="button" className="tx-toast-close" aria-label="Dismiss" onClick={dismissToast}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="m3.5 3.5 5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
