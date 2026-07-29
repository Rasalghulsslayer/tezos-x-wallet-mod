/**
 * AccountChip: compact "Signing with: <label> · 0x…" chip. When the pinned
 * account differs from the currently-active one (active-delta), a muted
 * footnote reminds the user they don't need to switch — approving signs
 * with the pinned account regardless of the wallet's current selection.
 */

import { Identicon } from './Identicon';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import type { AccountSummary } from '@tezosx/wallet-core/shared/messages';

export function AccountChip({
  account,
  fallbackLabel,
  activeAccountId,
  showActiveDeltaHint = false,
}: {
  account:              AccountSummary;
  fallbackLabel?:       string;
  activeAccountId?:     string;
  showActiveDeltaHint?: boolean;
}) {
  const label  = account.label?.trim() != null && account.label.trim().length > 0
    ? account.label
    : (fallbackLabel ?? 'Account');
  const delta  = showActiveDeltaHint && activeAccountId != null && activeAccountId !== account.id;
  const kind   = account.kind === 'tezos' ? 'l1' : 'l2';

  return (
    <div className="tx-account-chip-wrap">
      <div className={`tx-account-chip ${kind}`} role="group" aria-label="Signing account">
        <div className="ident"><Identicon seed={account.primaryAddress} /></div>
        <div className="body">
          <span className="prefix">Signing with</span>
          <span className="label">{label}</span>
          <span className="sep">·</span>
          <span className="addr">{shortAddr(account.primaryAddress)}</span>
        </div>
      </div>
      {delta && (
        <div className="tx-account-chip-hint">
          This is the account that initiated the request — you don't need to switch.
          Approving signs with it regardless of your current selection.
        </div>
      )}
    </div>
  );
}
