/**
 * ActivityRow: presentation component for one item in the Activity feed.
 * 3-column grid (asset mark · body · amount); the leading disc is the
 * transferred asset's logo (AssetMark) with a direction badge in the corner,
 * wrapped in a ring that carries runtime (purple = L1, cyan = L2, gradient =
 * cross-runtime). Pending becomes a conic spinner in warning; failed flips
 * the ring to danger and the badge to an ✕. Non-transfer rows (contract
 * call, signed message, unknown) center a design-system stroke icon instead
 * of a logo.
 */

import type { ActivityRowVM, RuntimeBadge } from '../view-models/activity-vm';
import { AssetMark } from './AssetMark';
import { ExternalArrow } from './ExternalArrow';
import { Icon, type IconName } from './Icon';

export function ActivityRow({
  vm,
  onPrimaryClick,
  onSecondaryClick,
}: {
  vm:                ActivityRowVM;
  onPrimaryClick:    () => void;
  onSecondaryClick?: () => void;
}) {
  const identClass = identClassOf(vm.runtimeBadge, vm.status);
  const tagClass   = tagClassOf(vm.runtimeBadge);
  const valueClass = valueClassOf(vm);
  const showLinks  = vm.status !== 'pending' && vm.primaryUrl !== '';

  const primary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPrimaryClick();
  };
  const secondary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSecondaryClick?.();
  };

  return (
    <div
      className="tx-activity"
      onClick={onPrimaryClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPrimaryClick(); }}
    >
      <div className={identClass} aria-hidden>
        <div className="ring" />
        <div className="core">
          {vm.assetRef != null
            ? <AssetMark asset={vm.assetRef} size="sm" />
            : <Icon name={coreIconOf(vm)} size={14} />}
        </div>
        {dirBadgeOf(vm)}
      </div>

      <div className="body">
        <div className="t1">
          <span className="verb">{vm.verb}</span>
          {vm.arrow !== '·' && <span className="arrow">{vm.arrow}</span>}
          <span className="addr">{vm.counterparty}</span>
        </div>
        <div className="t2">
          {vm.status === 'failed' ? (
            <span className="failed-tag">Failed</span>
          ) : (
            <span className={tagClass}>{vm.runtimeTag}</span>
          )}
          <span className="sep" aria-hidden>·</span>
          {vm.status === 'pending'
            ? <span className="pending-tag">{vm.ago}</span>
            : <span>{vm.ago}</span>}
        </div>
      </div>

      <div className="amt">
        {vm.amount.value !== '' && (
          <div className={valueClass}>
            {vm.amount.sign}{vm.amount.value} {vm.asset}
          </div>
        )}
        {showLinks && (
          <div className="links">
            <a
              aria-label={vm.runtimeBadge === 'l2' ? 'View on blockscout' : 'View on tzkt'}
              onClick={primary}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onPrimaryClick(); }}
            >
              <ExternalArrow />
            </a>
            {vm.secondaryUrl != null && onSecondaryClick != null && (
              <a
                aria-label="View on the other explorer"
                onClick={secondary}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSecondaryClick(); }}
              >
                <ExternalArrow />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Stroke icon for rows that carry no asset (contract call, signature, …). */
function coreIconOf(vm: ActivityRowVM): IconName {
  if (vm.status === 'failed')          return 'x';
  if (vm.verb === 'Contract call')     return 'code';
  if (vm.verb === 'Signed message')    return 'pen';
  return 'activity';
}

/** Corner badge: ✕ on failure, otherwise the transfer direction. */
function dirBadgeOf(vm: ActivityRowVM) {
  const badge =
    vm.status === 'failed'    ? { icon: 'x' as const,               cls: 'failed' } :
    vm.verb === 'Sent'        ? { icon: 'arrow-up-right' as const,  cls: 'out' }    :
    vm.verb === 'Received'    ? { icon: 'arrow-down-left' as const, cls: 'in' }     :
                                null;
  if (badge == null) return null;
  return (
    <span className={`dir-badge ${badge.cls}`}>
      <Icon name={badge.icon} size={9} strokeWidth={2.75} />
    </span>
  );
}

function identClassOf(badge: RuntimeBadge, status: ActivityRowVM['status']): string {
  const base = 'tx-activity-ident';
  const runtime = badge === 'l1' ? 'l1' : badge === 'l2' ? 'l2' : 'cross';
  if (status === 'pending') return `${base} ${runtime} pending`;
  if (status === 'failed')  return `${base} ${runtime} failed`;
  return `${base} ${runtime}`;
}

function tagClassOf(badge: RuntimeBadge): string {
  return badge === 'l1' ? 'tag l1' : badge === 'l2' ? 'tag l2' : 'tag cross';
}

function valueClassOf(vm: ActivityRowVM): string {
  if (vm.status === 'failed')  return 'v failed';
  if (vm.status === 'pending') return 'v pending';
  if (vm.amount.sign === '+')  return 'v pos';
  if (vm.amount.sign === '−')  return 'v neg';
  return 'v';
}
