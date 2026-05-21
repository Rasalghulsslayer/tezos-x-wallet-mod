import type { AccountId } from '../../domain/account';
import { Identicon } from './Identicon';
import { Icon } from './Icon';
import type { AccountRowVM } from '../view-models/account-switcher-vm';

export function AccountSwitcherRow({
  vm, onSetActive, onRename, onRemove, isLast, showActions,
}: {
  vm:          AccountRowVM;
  onSetActive: (accountId: AccountId) => void;
  onRename?:   (accountId: AccountId) => void;
  onRemove?:   (accountId: AccountId) => void;
  isLast:      boolean;
  showActions: boolean;
}) {
  return (
    <div
      className={`tx-account-switcher-row${vm.isActive ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSetActive(vm.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSetActive(vm.id); }}
    >
      <div className={`ident ${vm.kindLabel === 'Michelson' ? 'l1' : 'l2'}`}>
        <Identicon seed={vm.identitySeed} />
      </div>

      <div className="body">
        <div className="label">
          <span className="t">{vm.displayLabel}</span>
          {vm.isActive && <span className="active-dot" aria-label="Active" />}
        </div>
        <div className="meta">
          <span className="kind">{vm.kindLabel}</span>
          <span className="sep">·</span>
          <span className="addr">{vm.primaryAddress}</span>
        </div>
      </div>

      {showActions && (
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          {onRename && (
            <button
              className="tx-account-switcher-action"
              type="button"
              aria-label={`Rename ${vm.displayLabel}`}
              onClick={() => onRename(vm.id)}
            >
              <Icon name="settings" size={13} />
            </button>
          )}
          {onRemove && (
            <button
              className="tx-account-switcher-action danger"
              type="button"
              aria-label={`Remove ${vm.displayLabel}`}
              disabled={isLast}
              title={isLast ? 'Cannot remove the last account' : undefined}
              onClick={() => { if (!isLast) onRemove(vm.id); }}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
