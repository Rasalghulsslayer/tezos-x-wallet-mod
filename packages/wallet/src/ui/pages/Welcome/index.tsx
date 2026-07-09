import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../tx/Button';
import { LogoMark } from '../../tx/LogoMark';
import { KindCard } from './KindCard';

type Kind = 'tezos' | 'evm';

export function Welcome({ onDone: _onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('tezos');

  const go = (path: 'create' | 'import') => navigate(`/${path}?kind=${kind}`);

  return (
    <div className="tx-page">
      <div className="tx-page-scroll" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <div style={{ position: 'relative', width: 120, height: 120, display: 'grid', placeItems: 'center' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'radial-gradient(closest-side, rgba(124,92,255,0.35), transparent 70%)',
                animation: 'tx-page-in 600ms var(--tx-ease)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'radial-gradient(closest-side, rgba(0,194,255,0.30), transparent 70%)',
                transform: 'translate(18px, 6px)',
              }}
            />
            <div style={{ position: 'relative' }}>
              <LogoMark size={56} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              One wallet.<br />Two runtimes.
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 10, maxWidth: 280 }}>
              Pick the runtime your account belongs to. You can add the other one in a future release.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', marginTop: 8 }}>
            <KindCard
              accent="purple"
              chain="tz1"
              title="Michelson runtime"
              detail="tz1 · BIP-39 mnemonic"
              selected={kind === 'tezos'}
              onClick={() => setKind('tezos')}
            />
            <KindCard
              accent="cyan"
              chain="0x"
              title="EVM runtime"
              detail="0x · secp256k1 key"
              selected={kind === 'evm'}
              onClick={() => setKind('evm')}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="accent" full onClick={() => go('create')}>Create a new wallet</Button>
          <Button variant="ghost"  full onClick={() => go('import')}>
            {kind === 'tezos' ? 'I have a recovery phrase' : 'I have a private key'}
          </Button>
        </div>
      </div>
    </div>
  );
}
