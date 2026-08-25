import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { sessionIdentity, type StoredSession } from '@tezosx/wallet-core/ports/session-store';
import { sendPopupRequest } from '@/shared/messaging';
import { timeAgo } from '@tezosx/wallet-core/shared/format';
import { originDisplay } from '@tezosx/wallet-core/shared/approval-display';
import { TopBar } from '../tx/TopBar';
import { Icon } from '../tx/Icon';
import { Button } from '../tx/Button';
import { EmptyState } from '../tx/EmptyState';
import {
  type ConnectionsFilter,
  filterSessions,
  describeSessionAccount,
} from '../view-models/connections-vm';

const STORAGE_KEY = 'connectionsViewFilter';

export function Connections({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StoredSession[] | null>(null);
  const [filter,   setFilter]   = useState<ConnectionsFilter>('all');

  // Hydrate the persisted filter pref on first mount.
  useEffect(() => {
    void chrome.storage.local.get(STORAGE_KEY).then((d) => {
      const v = d[STORAGE_KEY];
      if (v === 'all' || v === 'active') setFilter(v);
    });
  }, []);

  const updateFilter = (f: ConnectionsFilter) => {
    setFilter(f);
    void chrome.storage.local.set({ [STORAGE_KEY]: f });
  };

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

  const accounts        = state.status === 'unlocked' ? state.accounts : [];
  const activeAccountId = state.status === 'unlocked' ? state.accountId : '';
  const multiAccount    = accounts.length > 1;
  const visible = useMemo(
    () => sessions == null ? null : filterSessions(sessions, filter, activeAccountId),
    [sessions, filter, activeAccountId],
  );

  if (state.status !== 'unlocked') return null;

  return (
    <div className="tx-page">
      <TopBar title="Connected sites" onBack={() => navigate(-1)} />
      <div className="tx-page-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        {multiAccount && (
          <div className="tx-connections-filter">
            <button className={filter === 'all'    ? 'on' : ''} onClick={() => updateFilter('all')}    type="button">All accounts</button>
            <button className={filter === 'active' ? 'on' : ''} onClick={() => updateFilter('active')} type="button">This account</button>
          </div>
        )}

        {visible == null ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-fg-muted)', fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M9 4v5M15 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="6" y="9" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 15v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            title={filter === 'active' ? 'No dApps connected with this account' : 'No connected dApps'}
            detail={filter === 'active'
              ? 'Switch to "All accounts" to see sessions tied to other accounts.'
              : "When a website asks to connect, you'll review and approve it here."}
          />
        ) : (
          <div style={{ padding: '8px 0' }}>
            {visible.map((s) => {
              const { title: host, favLetter } = originDisplay(s.origin);
              const acct = describeSessionAccount(s, accounts);
              return (
                <div key={sessionIdentity(s)} className="tx-connections-row">
                  <div className="tx-origin-fav">{favLetter}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t" title={s.origin}>{host}</div>
                    <div className="m">
                      <Icon name="info" size={11} />
                      <span>{timeAgo(s.connectedAt)}</span>
                      <span className="sep">·</span>
                      <span className={acct.missing ? 'missing' : ''}>
                        {acct.label}
                        {acct.address != null && <> · <span className="addr">{acct.address}</span></>}
                      </span>
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
