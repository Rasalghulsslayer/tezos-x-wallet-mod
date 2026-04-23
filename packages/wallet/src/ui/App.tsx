import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { VaultState } from '../lib/messages';
import { sendPopupRequest } from '../lib/messaging';
import { Welcome }   from './pages/Welcome';
import { Create }    from './pages/Create';
import { Import }    from './pages/Import';
import { Unlock }    from './pages/Unlock';
import { Home }      from './pages/Home';
import { Send }      from './pages/Send';
import { Activity }  from './pages/Activity';
import { Connections } from './pages/Connections';
import { Settings }  from './pages/Settings';
import { Spinner }   from './components/Spinner';

/**
 * Root of the popup UI. Fetches the vault state from the service worker and
 * routes the user to the correct entry screen (welcome / unlock / home).
 */
export function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}

function Gate() {
  const [state, setState]   = useState<VaultState | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const navigate            = useNavigate();

  const refresh = async () => {
    try {
      const s = await sendPopupRequest<VaultState>({ type: 'GET_STATE' });
      setState(s);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (state == null) return;
    // Only hard-redirect on initial load; let explicit nav take over afterwards.
    if (state.status === 'empty')    navigate('/welcome', { replace: true });
    if (state.status === 'locked')   navigate('/unlock',  { replace: true });
    if (state.status === 'unlocked') {
      const current = window.location.hash;
      if (current === '' || current === '#/' || current === '#/welcome' || current === '#/unlock') {
        navigate('/', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

  if (error != null) {
    return (
      <div className="p-6 text-red-400 text-sm">
        Failed to reach the wallet backend: {error}
      </div>
    );
  }

  if (state == null) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <Spinner />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/welcome"     element={<Welcome     onDone={refresh} />} />
      <Route path="/create"      element={<Create      onDone={refresh} />} />
      <Route path="/import"      element={<Import      onDone={refresh} />} />
      <Route path="/unlock"      element={<Unlock      onDone={refresh} />} />
      <Route path="/"            element={<Home        state={state}    onChanged={refresh} />} />
      <Route path="/send"        element={<Send        state={state}    onDone={refresh} />} />
      <Route path="/activity"    element={<Activity    state={state} />} />
      <Route path="/connections" element={<Connections state={state}    onChanged={refresh} />} />
      <Route path="/settings"    element={<Settings    state={state}    onLock={refresh} />} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
