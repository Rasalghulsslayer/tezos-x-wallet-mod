/**
 * AccountHeader: the unified active-account card on Home. Single identicon +
 * label + kind subtitle, with controls on the right (a "+" add button when
 * N=1, or a "Switch N ▾" pill when N≥2). Address rows below: tz1 + EVM alias
 * for Tezos accounts, the 0x alone for EVM-native. Replaces the chip +
 * AccountCard duplication that 0.9.0-MA3a shipped.
 */

import { Identicon } from './Identicon';
import { Icon } from './Icon';
import { toast } from './Toast';
import { RESOLVING_EVM_ADDRESS } from './utils';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import type { VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';

export function AccountHeader({
  state,
  displayLabel,
  onSwitcherOpen,
  onAddAccount,
}: {
  state:           VaultStateUnlocked;
  displayLabel:    string;
  onSwitcherOpen?: () => void;
  onAddAccount?:   () => void;
}) {
  const n       = state.accounts.length;
  const isTezos = state.kind === 'tezos';
  const seed    = isTezos ? state.tz1 : state.address;

  return (
    <div className={`tx-account-header${isTezos ? ' tezos' : ' evm'}`}>
      <div className="ah-top">
        <div className={`ah-ident ${isTezos ? 'tezos' : 'evm'}`}>
          <Identicon seed={seed} />
        </div>
        <div className="ah-id">
          <div className="ah-label" title={displayLabel}>{displayLabel}</div>
          <div className="ah-kind">
            <span className={`swatch ${isTezos ? 'both' : 'l2'}`} aria-hidden />
            {isTezos ? 'Tezos · dual runtime' : 'EVM-native'}
          </div>
        </div>
        <div className="ah-controls">
          {n >= 2 && onSwitcherOpen != null && (
            <button
              type="button"
              className="ah-switcher"
              onClick={onSwitcherOpen}
              aria-label="Switch account"
            >
              Switch
              <span className="n">{n}</span>
              <Icon name="chevron-down" size={9} />
            </button>
          )}
          {n === 1 && onAddAccount != null && (
            <button
              type="button"
              className="ah-add"
              onClick={onAddAccount}
              aria-label="Add account"
            >
              <Icon name="plus" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="ah-addrs">
        {isTezos ? (
          <>
            <AddrRow chain="l1" addr={state.tz1}      copyLabel="tz1" />
            <AddrRow chain="l2" addr={state.evmAlias} copyLabel="EVM alias" />
          </>
        ) : (
          <AddrRow chain="l2" addr={state.address} copyLabel="EVM" />
        )}
      </div>
    </div>
  );
}

/** `addr` is null while the EVM alias backfill has not landed yet: the row shows the resolving placeholder and offers no copy. */
function AddrRow({ chain, addr, copyLabel }: { chain: 'l1' | 'l2'; addr: string | null; copyLabel: string }) {
  if (addr == null) {
    return (
      <div className="ah-addr" aria-disabled="true" style={{ cursor: 'default' }}>
        <span className={`badge ${chain}`}>{chain.toUpperCase()}</span>
        <span className="addr-val" style={{ color: 'var(--tx-fg-muted)', fontFamily: 'inherit' }}>{RESOLVING_EVM_ADDRESS}</span>
      </div>
    );
  }
  const copy = () => {
    void navigator.clipboard.writeText(addr);
    toast(`${copyLabel} address copied`);
  };
  return (
    <div className="ah-addr" role="button" tabIndex={0} onClick={copy} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') copy(); }}>
      <span className={`badge ${chain}`}>{chain.toUpperCase()}</span>
      <span className="addr-val">{shortAddr(addr, 8, 6)}</span>
      <span className="copy-btn" aria-hidden><Icon name="copy" size={11} /></span>
    </div>
  );
}
