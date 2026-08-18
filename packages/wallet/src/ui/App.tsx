import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { sendPopupRequest, SW_SESSION_LOST_EVENT } from '../shared/messaging';
import { makeError, formatError } from '@tezosx/wallet-core/domain/error';
import { startPoller } from '@tezosx/wallet-core/shared/poller';
import { Welcome }     from './pages/Welcome';
import { Create }      from './pages/Create';
import { Import }      from './pages/Import';
import { Unlock }      from './pages/Unlock';
import { Home }        from './pages/Home';
import { Send }        from './pages/Send';
import { Activity }    from './pages/Activity';
import { Connections } from './pages/Connections';
import { Settings }    from './pages/Settings';
import { Receive }     from './pages/Receive';
import { AddAccount }  from './pages/AddAccount';
import { AddToken }    from './pages/AddToken';
import { TokensSettings } from './pages/TokensSettings';
import { Contacts }    from './pages/Contacts';
import { ToastHost }   from './tx/Toast';
import { ExperimentalBanner } from './tx/ExperimentalBanner';
import { FatalScreen } from './tx/FatalScreen';
import { ErrorCard }   from './tx/ErrorCard';
import { Button }      from './tx/Button';

// Cadence of the GET_STATE re-poll while the active tz1 account's EVM alias is
// still resolving: the SW backfills in the background with no push channel to
// the popup, so the Gate polls until the alias lands (or gives up quietly —
// the next natural refresh picks it up).
const ALIAS_POLL_MS         = 1_500;
const ALIAS_POLL_TIMEOUT_MS = 60_000;

export function App() {
  return (
    <div className="tx-popup">
      <ExperimentalBanner />
      <HashRouter>
        <Gate />
      </HashRouter>
      <ToastHost />
    </div>
  );
}

function Gate() {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const navigate          = useNavigate();

  const refresh = async () => {
    try {
      const s = await sendPopupRequest<VaultState>({ type: 'GET_STATE' });
      setState(s);
      setError(null);
    } catch (e) {
      // Keep the Error object: its numeric `code` (when present) is what
      // distinguishes "the SW answered with a failure" from "the SW is dead".
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  };

  useEffect(() => { void refresh(); }, []);

  // The active tz1 account's EVM alias resolves through a background backfill
  // in the SW, with no push channel back to the popup. Re-poll GET_STATE until
  // the alias lands, the state leaves unlocked-tezos, or the poll times out.
  const aliasResolving =
    state != null && state.status === 'unlocked' && state.kind === 'tezos' && state.evmAlias === null;

  useEffect(() => {
    if (!aliasResolving) return;
    const handle = startPoller<VaultState>({
      intervalMs: ALIAS_POLL_MS,
      timeoutMs:  ALIAS_POLL_TIMEOUT_MS,
      fetch:      () => sendPopupRequest<VaultState>({ type: 'GET_STATE' }),
      onUpdate:   setState,
      isDone:     (s) => !(s.status === 'unlocked' && s.kind === 'tezos' && s.evmAlias === null),
    });
    return () => handle.stop();
  }, [aliasResolving]);

  // The SW restarts on its own schedule (MV3 idle eviction, long-running calls
  // like cross-runtime sign + resolve). When it comes back its keyring is
  // empty, so a popup operation issued against stale React state returns 4100.
  // Refresh GET_STATE on that signal so the Gate routes back to /unlock
  // automatically instead of stranding the user on the failing page.
  useEffect(() => {
    const onSessionLost = () => { void refresh(); };
    window.addEventListener(SW_SESSION_LOST_EVENT, onSessionLost);
    return () => window.removeEventListener(SW_SESSION_LOST_EVENT, onSessionLost);
  }, []);

  useEffect(() => {
    if (state == null) return;
    if (state.status === 'empty')  navigate('/welcome', { replace: true });
    if (state.status === 'locked') navigate('/unlock',  { replace: true });
    if (state.status === 'unlocked') {
      const hash = window.location.hash;
      if (hash === '' || hash === '#/' || hash === '#/welcome' || hash === '#/unlock') {
        navigate('/', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

  if (error != null) {
    // A numeric `code` on the rejection means the SW answered — it is alive,
    // the request itself failed (e.g. 4900 while the network is down). That is
    // retryable, not fatal: FatalScreen's "service worker unreachable"
    // diagnosis is reserved for rejections with no code (transport failure).
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code !== 'number') {
      return <FatalScreen error={makeError('sw-unreachable')} onReload={() => window.location.reload()} />;
    }
    return (
      <div className="tx-page" style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <ErrorCard error={formatError(error)} />
        <Button variant="accent" full onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (state == null) {
    return (
      <div className="tx-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="tx-sending" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/welcome"     element={<Welcome     onDone={refresh} />} />
      <Route path="/create"      element={<Create      onDone={refresh} />} />
      <Route path="/import"      element={<Import      onDone={refresh} />} />
      <Route path="/unlock"      element={<Unlock      onDone={refresh} />} />
      <Route path="/"            element={<Home        state={state}   onChanged={refresh} />} />
      <Route path="/send"        element={<Send        state={state}   onDone={refresh} />} />
      <Route path="/receive"     element={<Receive     state={state} />} />
      <Route path="/activity"    element={<Activity    state={state} />} />
      <Route path="/connections" element={<Connections state={state}   onChanged={refresh} />} />
      <Route path="/settings"    element={<Settings    state={state}   onLock={refresh} />} />
      <Route path="/accounts/add" element={<AddAccount  state={state}   onChanged={refresh} />} />
      <Route path="/tokens"       element={<TokensSettings state={state} />} />
      <Route path="/tokens/add"   element={<AddToken    state={state} />} />
      <Route path="/contacts"     element={<Contacts    state={state} />} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
