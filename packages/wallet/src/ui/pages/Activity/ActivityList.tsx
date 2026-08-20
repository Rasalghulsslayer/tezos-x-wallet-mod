import { useMemo } from 'react';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';
import { activityRowVM, type ActivityRowVM } from '../../view-models/activity-vm';
import { ActivityRow } from '../../tx/ActivityRow';
import { DAY_ORDER, type DayGroup } from './helpers';

export function ActivityList({
  items, cursor, loadingMore, onLoadMore,
}: {
  items:       ActivityItem[];
  cursor:      string | undefined;
  loadingMore: boolean;
  onLoadMore:  () => void;
}) {
  const nowMs   = Date.now();
  // Bucket on the dayGroup the VM already computes for every row.
  const grouped = useMemo(() => {
    const out: Record<DayGroup, ActivityRowVM[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const item of items) {
      const vm = activityRowVM(item, nowMs);
      out[vm.dayGroup].push(vm);
    }
    return out;
  }, [items, nowMs]);

  return (
    <div style={{ padding: '0 8px 8px' }}>
      {DAY_ORDER.map((group) => {
        const groupItems = grouped[group];
        if (groupItems.length === 0) return null;
        return (
          <div key={group}>
            <div className="tx-activity-group-head">{group}</div>
            {groupItems.map((vm) => {
              return (
                <ActivityRow
                  key={vm.id}
                  vm={vm}
                  onPrimaryClick={() => { if (vm.primaryUrl !== '') window.open(vm.primaryUrl, '_blank', 'noopener,noreferrer'); }}
                  onSecondaryClick={vm.secondaryUrl != null
                    ? () => window.open(vm.secondaryUrl, '_blank', 'noopener,noreferrer')
                    : undefined}
                />
              );
            })}
          </div>
        );
      })}
      {cursor != null ? (
        <div
          className={`tx-activity-foot${loadingMore ? '' : ' tappable'}`}
          onClick={loadingMore ? undefined : onLoadMore}
          role={loadingMore ? undefined : 'button'}
          tabIndex={loadingMore ? undefined : 0}
          onKeyDown={(e) => { if (!loadingMore && e.key === 'Enter') onLoadMore(); }}
        >
          {loadingMore && <span className="spin" aria-hidden />}
          <span>{loadingMore ? 'Loading more…' : 'Show older activity'}</span>
        </div>
      ) : items.length > 0 && (
        <div className="tx-activity-foot end">— end —</div>
      )}
    </div>
  );
}
