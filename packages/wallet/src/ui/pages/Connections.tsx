import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/lib/messages';
import type { StoredSession } from '@/ports/session-store';
import { sendPopupRequest } from '@/lib/messaging';
import { timeAgo } from '@/lib/format';
import { TopBar } from '../tx/TopBar';
import { Icon } from '../tx/Icon';
import { Button } from '../tx/Button';
import { EmptyState } from '../tx/EmptyState';

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
      <div className="tx-page-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        {sessions == null ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-fg-muted)', fontSize: 13 }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M9 4v5M15 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="6" y="9" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 15v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            title="No connected dApps"
            detail="When a website asks to connect, you'll review and approve it here."
          />
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
