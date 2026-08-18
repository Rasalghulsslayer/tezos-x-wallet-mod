import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../tx/Button';
import { LogoMark } from '../../tx/LogoMark';
import { KindRow } from '../../tx/KindRow';

type Kind = 'tezos' | 'evm';

/**
 * First-run landing. Left-aligned composition: the runtime choice is a pair
 * of full-width rows whose selection tints the primary CTA below — the
 * decision and its consequence sit in one vertical line.
 */
export function Welcome({ onDone: _onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('tezos');

  const go = (path: 'create' | 'import') => navigate(`/${path}?kind=${kind}`);

  return (
    <div className="tx-page">
      <div className="tx-page-scroll" style={{ padding: '26px 20px 12px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <LogoMark size={24} />
            <span className="tx-kicker">Tezos X</span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.18 }}>
            One wallet.<br />Two runtimes.
          </div>
          <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', lineHeight: 1.5, marginTop: 12 }}>
            Pick the runtime your account belongs to. You can add the other one in a future release.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KindRow
            accent="purple"
            glyph="tz1"
            title="Michelson runtime"
            detail="tz1 · BIP-39 mnemonic"
            selected={kind === 'tezos'}
            onClick={() => setKind('tezos')}
          />
          <KindRow
            accent="cyan"
            glyph="0x"
            title="EVM runtime"
            detail="0x · secp256k1 key"
            selected={kind === 'evm'}
            onClick={() => setKind('evm')}
          />
        </div>
      </div>
      <div className="tx-action-bar" style={{ flexDirection: 'column' }}>
        <Button variant={kind === 'evm' ? 'accent-cyan' : 'accent'} full onClick={() => go('create')}>
          Create a new wallet
        </Button>
        <Button variant="ghost" full onClick={() => go('import')}>
          {kind === 'tezos' ? 'I have a recovery phrase' : 'I have a private key'}
        </Button>
      </div>
    </div>
  );
}
