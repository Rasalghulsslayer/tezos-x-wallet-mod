/**
 * useOnline: tracks the browser's connectivity flag and fires an optional
 * callback on every offline → online transition (the 'online' event only fires
 * on genuine transitions, so the callback is a clean "we're back" hook for
 * refetches).
 *
 * navigator.onLine is only trustworthy in one direction: false means the OS
 * has no network route at all, while true merely means a route exists — the
 * Tezos X endpoints may still be unreachable. Callers picking user-facing copy
 * should treat `false` as "you're offline" and a fetch failure while `true`
 * as "can't reach the network".
 */

import { useEffect, useRef, useState } from 'react';

/** Copy for a fetch-failed banner, honest about what we actually know. */
export function unreachableTitle(online: boolean): string {
  return online ? "Can't reach the Tezos X network" : "You're offline";
}

export function useOnline(onReconnect?: () => void): boolean {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;

  useEffect(() => {
    const up = () => {
      setOnline(true);
      reconnectRef.current?.();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
