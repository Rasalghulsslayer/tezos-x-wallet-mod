import { MAX_ACCOUNTS_PER_VAULT } from '@/shared/constants';
import { Icon } from '../../tx/Icon';
import { PickCard } from './PickCard';
import type { Pick } from './types';

export function PickStep({ capReached, onChoose }: {
  capReached: boolean;
  onChoose:   (p: Pick) => void;
}) {
  return (
    <div className="tx-page-scroll">
      <div className="tx-add-step-head">
        <div className="kicker">Step 1 of 3</div>
        <h2>What kind of account?</h2>
        <p className="sub">Pick a runtime and whether you'll generate fresh keys or import existing ones.</p>
      </div>

      {capReached && (
        <div className="tx-add-confirm-note" style={{ color: 'var(--tx-danger)' }}>
          <span className="ico"><Icon name="alert" size={13} /></span>
          <span>Vault is at the {MAX_ACCOUNTS_PER_VAULT}-account cap. Remove one to add another.</span>
        </div>
      )}

      <div className="tx-add-pick-grid">
        <PickCard
          kind="tezos" source="fresh"
          title="Tezos account" subLine="Fresh BIP-39 mnemonic. Get a tz1 + EVM alias."
          specs={[{ k: 'Addresses', v: 'tz1 + 0x alias' }, { k: 'Key', v: 'BIP-39 seed' }]}
          disabled={capReached}
          onClick={() => onChoose({ kind: 'tezos', source: 'fresh' })}
        />
        <PickCard
          kind="tezos" source="import"
          title="Tezos account" subLine="Paste a recovery phrase or an edsk private key."
          specs={[{ k: 'Accepts', v: '12–24 words · edsk' }, { k: 'Yields', v: 'tz1 + 0x alias' }]}
          disabled={capReached}
          onClick={() => onChoose({ kind: 'tezos', source: 'import' })}
        />
        <PickCard
          kind="evm" source="fresh"
          title="EVM account" subLine="Fresh 256-bit private key. EVM runtime only."
          specs={[{ k: 'Address', v: '0x only' }, { k: 'Key', v: '64-char hex' }]}
          disabled={capReached}
          onClick={() => onChoose({ kind: 'evm', source: 'fresh' })}
        />
        <PickCard
          kind="evm" source="import"
          title="EVM account" subLine="Paste a 0x-prefixed or raw 64-char hex private key."
          specs={[{ k: 'Accepts', v: '0x… or raw hex' }, { k: 'Yields', v: '0x address' }]}
          disabled={capReached}
          onClick={() => onChoose({ kind: 'evm', source: 'import' })}
        />
      </div>
    </div>
  );
}
