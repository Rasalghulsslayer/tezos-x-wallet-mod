import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  listeners.forEach((l) => l(message));
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => listeners.forEach((l) => l(null)), 1600);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setMsg);
    return () => { listeners.delete(setMsg); };
  }, []);
  if (msg == null) return null;
  return (
    <div className="tx-toast-wrap">
      <div className="tx-toast">
        <Icon name="check" size={14} color="var(--tx-fg-inverted)" />
        {msg}
      </div>
    </div>
  );
}
