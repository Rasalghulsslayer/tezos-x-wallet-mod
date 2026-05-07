import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { VaultState } from '../lib/messages';
import { sendPopupRequest } from '../lib/messaging';
import { makeError } from '../lib/errors';
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
import { ToastHost }   from './tx/Toast';
import { ExperimentalBanner } from './tx/ExperimentalBanner';
import { FatalScreen } from './tx/FatalScreen';

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
  const [error, setError] = useState<string | null>(null);
  const navigate          = useNavigate();

  const refresh = async () => {
    try {
      const s = await sendPopupRequest<VaultState>({ type: 'GET_STATE' });
      setState(s);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void refresh(); }, []);

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
    return <FatalScreen error={makeError('sw-unreachable')} onReload={() => window.location.reload()} />;
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
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
