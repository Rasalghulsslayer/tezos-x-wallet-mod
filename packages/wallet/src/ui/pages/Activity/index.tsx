/**
 * Activity page — orchestrator. Holds the rendered items + cursor + pending
 * buffer + filter state; auto-refresh poll buffers new items behind a pill
 * for the user to merge in. The list rendering and day-grouping live in
 * ActivityList; pure helpers in helpers.ts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState, ActivityFilter, ActivityPage } from '@tezosx/wallet-core/shared/messages';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';
import { ACTIVITY_AUTO_REFRESH_MS, ACTIVITY_PAGE_SIZE } from '@tezosx/wallet-core/shared/constants';
import { sendPopupRequest } from '@/shared/messaging';
import { startPoller } from '@tezosx/wallet-core/shared/poller';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { TopBar } from '../../tx/TopBar';
import { BottomTabs } from '../../tx/BottomTabs';
import { ActivityFilters, type DirectionFilter, type RuntimeFilter } from '../../tx/ActivityFilters';
import { ActivityNewPill } from '../../tx/ActivityNewPill';
import { ActivityStaleBand } from '../../tx/ActivityStaleBand';
import { IconBtn } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { errorToast } from '../../tx/Toast';
import { ActivityList } from './ActivityList';

function buildFilter(direction: DirectionFilter, runtime: RuntimeFilter): ActivityFilter | undefined {
  const f: ActivityFilter = {};
  if (direction !== 'all') f.direction = [direction];
  if (runtime   !== 'all') {
    f.runtime = runtime === 'cross'
      ? ['cross-runtime']
      : [runtime];
  }
  return f.direction != null || f.runtime != null ? f : undefined;
}

export function Activity({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  const [items,        setItems]        = useState<ActivityItem[]>([]);
  const [cursor,       setCursor]       = useState<string | undefined>(undefined);
  const [pending,      setPending]      = useState<ActivityItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [direction,    setDirection]    = useState<DirectionFilter>('all');
  const [runtime,      setRuntime]      = useState<RuntimeFilter>('all');
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [staleness,    setStaleness]    = useState<ActivityPage['staleness']>('fresh');

  const filter = useMemo(() => buildFilter(direction, runtime), [direction, runtime]);
  const renderedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const renderedIdsRef = useRef(renderedIds);
  renderedIdsRef.current = renderedIds;

  useEffect(() => {
    if (state.status !== 'unlocked') return;
    let cancelled = false;
    setLoading(true);
    setPending([]);
    setStaleDismissed(false);
    sendPopupRequest<ActivityPage>({ type: 'LIST_ACTIVITY', limit: ACTIVITY_PAGE_SIZE, filter })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.cursor);
        setStaleness(page.staleness);
        if (page.errors != null && page.errors.length > 0) {
          errorToast({ message: page.errors[0].message, secondary: '· activity' });
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        errorToast({ message: formatError(e).title, secondary: '· activity' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state.status, filter]);

  useEffect(() => {
    if (state.status !== 'unlocked') return;
    const handle = startPoller<ActivityPage>({
      fetch:    () => sendPopupRequest<ActivityPage>({ type: 'LIST_ACTIVITY', limit: ACTIVITY_PAGE_SIZE, filter }),
      onUpdate: (page) => {
        setStaleness(page.staleness);
        const fresh = page.items.filter((i) => !renderedIdsRef.current.has(i.id));
        if (fresh.length > 0) {
          setPending((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            const dedup    = fresh.filter((f) => !existing.has(f.id));
            return [...prev, ...dedup].sort((a, b) => b.timestamp - a.timestamp);
          });
        }
      },
      isDone:   () => false,
      intervalMs: ACTIVITY_AUTO_REFRESH_MS,
      timeoutMs:  Number.MAX_SAFE_INTEGER,
    });
    return () => handle.stop();
  }, [state.status, filter]);

  if (state.status !== 'unlocked') return null;

  const manualRefresh = async () => {
    try {
      const page = await sendPopupRequest<ActivityPage>({ type: 'LIST_ACTIVITY', limit: ACTIVITY_PAGE_SIZE, filter });
      setItems(page.items);
      setCursor(page.cursor);
      setStaleness(page.staleness);
      setPending([]);
      setStaleDismissed(false);
    } catch (e) {
      errorToast({ message: formatError(e).title, secondary: '· activity' });
    }
  };

  const loadMore = async () => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await sendPopupRequest<ActivityPage>({ type: 'LIST_ACTIVITY', limit: ACTIVITY_PAGE_SIZE, cursor, filter });
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        const extra = page.items.filter((i) => !ids.has(i.id));
        return [...prev, ...extra];
      });
      setCursor(page.cursor);
    } catch (e) {
      errorToast({ message: formatError(e).title, secondary: '· activity', retry: () => void loadMore() });
    } finally {
      setLoadingMore(false);
    }
  };

  const mergePending = () => {
    if (pending.length === 0) return;
    setItems((prev) => {
      const ids = new Set(prev.map((i) => i.id));
      const extra = pending.filter((p) => !ids.has(p.id));
      return [...extra, ...prev].sort((a, b) => b.timestamp - a.timestamp);
    });
    setPending([]);
  };

  const showStaleBand = staleness !== 'fresh' && !staleDismissed && items.length > 0;

  return (
    <div className="tx-page">
      <TopBar
        title="Activity"
        right={
          <IconBtn label="Refresh" size="sm" onClick={() => void manualRefresh()}>
            <Icon name="refresh" size={16} />
          </IconBtn>
        }
      />

      {showStaleBand && (
        <ActivityStaleBand
          title="Activity may be delayed"
          detail={staleness === 'cached-only' ? 'both sources unreachable' : 'one source is catching up'}
          onDismiss={() => setStaleDismissed(true)}
        />
      )}

      <ActivityFilters
        direction={direction} setDirection={setDirection}
        runtime={runtime}     setRuntime={setRuntime}
      />

      <ActivityNewPill count={pending.length} onClick={mergePending} />

      <div
        className="tx-page-scroll"
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingTop: pending.length > 0 ? 48 : 0,
        }}
      >
        {loading && items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-fg-muted)', fontSize: 13 }}>
            Loading activity…
          </div>
        ) : items.length === 0 ? (
          <div className="tx-activity-empty">
            <div className="icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h4>No activity yet</h4>
            <p>Send or receive XTZ and your transactions will show up here.</p>
            <button onClick={() => navigate('/receive')}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Receive
            </button>
          </div>
        ) : (
          <ActivityList
            items={items}
            cursor={cursor}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        )}
      </div>
      <BottomTabs />
    </div>
  );
}
