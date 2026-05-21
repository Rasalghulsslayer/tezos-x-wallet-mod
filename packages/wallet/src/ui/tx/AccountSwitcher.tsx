/**
 * AccountSwitcher: popover anchored under the AccountCard. Active row hoisted
 * to the top, others sorted by createdAt ASC; tap a row to switch, settings →
 * rename, ✕ → remove (last-account guard disables the button). "Add account"
 * footer renders when an `onAdd` handler is provided (i.e. in switch mode from
 * Home — not in pick mode used by Settings → Reveal Secret).
 */

import { useEffect, useRef } from 'react';
import type { VaultStateUnlocked } from '../../shared/messages';
import type { AccountId } from '../../domain/account';
import { Icon } from './Icon';
import { AccountSwitcherRow } from './AccountSwitcherRow';
import { accountSwitcherVM } from '../view-models/account-switcher-vm';

export type SwitcherMode = 'switch' | 'pick';

export function AccountSwitcher({
  state, mode = 'switch', onClose, onSetActive, onRename, onRemove, onAdd,
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
      <AccountSwitcherRow
        vm={vm.active}
        onSetActive={onSetActive}
        onRename={onRename}
        onRemove={onRemove}
        isLast={total === 1}
        showActions={showActions}
      />
      {vm.others.map((row) => (
        <AccountSwitcherRow
          key={row.id}
          vm={row}
          onSetActive={onSetActive}
          onRename={onRename}
          onRemove={onRemove}
          isLast={total === 1}
          showActions={showActions}
        />
      ))}

      {showActions && onAdd != null && (
        <button className="tx-account-switcher-foot" onClick={onAdd} type="button">
          <Icon name="plus" size={14} />
          <span>Add account</span>
        </button>
      )}
    </div>
  );
}
