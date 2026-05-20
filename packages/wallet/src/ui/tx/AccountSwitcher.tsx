/**
 * AccountSwitcher: popover anchored under the AccountCard. Lists every account
 * (active on top, rest by createdAt ASC); tap a row to switch; pencil → rename;
 * trash → remove (last-account guard surfaces a tooltip). The "Add account"
 * footer is gated behind MA3B_LIVE until MA3b ships the /accounts/add route.
 */

import { useEffect, useRef } from 'react';
import type { VaultStateUnlocked } from '../../shared/messages';
import type { AccountId } from '../../domain/account';
import { Identicon } from './Identicon';
import { Icon } from './Icon';
import { accountSwitcherVM, type AccountRowVM } from '../view-models/account-switcher-vm';

const MA3B_LIVE = false;

export type SwitcherMode = 'switch' | 'pick';

export function AccountSwitcher({
  state,
  mode = 'switch',
  onClose,
  onSetActive,
  onRename,
  onRemove,
  onAdd,
}: {
  state:        VaultStateUnlocked;
  mode?:        SwitcherMode;
  onClose:      () => void;
  onSetActive:  (accountId: AccountId) => void;
  onRename?:    (accountId: AccountId) => void;
  onRemove?:    (accountId: AccountId) => void;
  onAdd?:       () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const vm      = accountSwitcherVM(state);
  const total   = vm.others.length + 1;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current != null && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const showActions = mode === 'switch';

  return (
    <div className="tx-account-switcher" ref={wrapRef} role="dialog" aria-label="Accounts">
      <Row vm={vm.active} onSetActive={onSetActive} onRename={onRename} onRemove={onRemove} isLast={total === 1} showActions={showActions} />
      {vm.others.map((row) => (
        <Row
          key={row.id}
          vm={row}
          onSetActive={onSetActive}
          onRename={onRename}
          onRemove={onRemove}
          isLast={total === 1}
          showActions={showActions}
        />
      ))}

      {showActions && MA3B_LIVE && (
        <button className="tx-account-switcher-foot" onClick={onAdd} type="button">
          <Icon name="plus" size={14} />
          <span>Add account</span>
        </button>
      )}
    </div>
  );
}

function Row({
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
