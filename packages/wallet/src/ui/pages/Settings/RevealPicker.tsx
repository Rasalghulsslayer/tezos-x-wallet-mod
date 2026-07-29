import type { AccountSummary } from '@tezosx/wallet-core/shared/messages';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Identicon } from '../../tx/Identicon';
import { Button } from '../../tx/Button';

export function RevealPicker({
  accounts, onPick, onCancel,
}: {
  accounts: AccountSummary[];
  onPick:   (id: AccountId) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Reveal secret</div>
      <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', marginBottom: 14 }}>
        Pick the account whose secret you want to see.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14, maxHeight: 280, overflowY: 'auto' }}>
        {accounts.map((acc, idx) => {
          const label = acc.label?.trim() != null && acc.label.trim().length > 0
            ? acc.label
            : `Account ${idx + 1}`;
          return (
            <div
              key={acc.id}
              className="tx-account-switcher-row"
              role="button"
              tabIndex={0}
              onClick={() => onPick(acc.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPick(acc.id); }}
            >
              <div className={`ident ${acc.kind === 'tezos' ? 'l1' : 'l2'}`}>
                <Identicon seed={acc.primaryAddress} />
              </div>
              <div className="body">
                <div className="label"><span className="t">{label}</span></div>
                <div className="meta">
                  <span className="kind">{acc.kind === 'tezos' ? 'Michelson' : 'EVM'}</span>
                  <span className="sep">·</span>
                  <span className="addr">{shortAddr(acc.primaryAddress)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="outline" full onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
}
