import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StoredSession, VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { timeAgo } from '@/lib/format';
import { TopBar } from '../tx/TopBar';
import { Icon } from '../tx/Icon';
import { Button } from '../tx/Button';

export function Connections({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StoredSession[] | null>(null);

  const refresh = async () => {
    const list = await sendPopupRequest<StoredSession[]>({ type: 'LIST_SESSIONS' });
    setSessions(list);
  };

  useEffect(() => { void refresh(); }, []);

  const disconnect = async (origin: string) => {
    await sendPopupRequest({ type: 'DISCONNECT', origin });
    await refresh();
    onChanged();
  };

  if (state.status !== 'unlocked') return null;

  return (
    <div className="tx-page">
      <TopBar title="Connected sites" onBack={() => navigate(-1)} />
      <div className="tx-page-scroll">
        {sessions == null ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-fg-muted)', fontSize: 13 }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>No connected sites</div>
            <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', marginTop: 6, maxWidth: 260, margin: '6px auto 0' }}>
              Visit a dApp and approve the connection — it will appear here.
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {sessions.map((s) => {
              let host = s.origin;
              try { host = new URL(s.origin).hostname; } catch { /* keep raw */ }
              return (
                <div key={s.origin} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--tx-border)' }}>
                  <div className="tx-origin-fav">{host.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.origin}>
                      {host}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="info" size={11} /> {timeAgo(s.connectedAt)}
                    </div>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => disconnect(s.origin)}>Disconnect</Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
