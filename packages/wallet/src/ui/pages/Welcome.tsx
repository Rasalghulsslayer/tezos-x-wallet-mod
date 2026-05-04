import { useNavigate } from 'react-router-dom';
import { Button } from '../tx/Button';

export function Welcome({ onDone: _onDone }: { onDone: () => void }) {
  const navigate = useNavigate();

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
            <div className="tx-logo-mark lg" style={{ width: 56, height: 56, borderRadius: 14, position: 'relative' }} />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              One wallet.<br />Two runtimes.
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 10, maxWidth: 280 }}>
              Hold and move assets across Tezos L1 and Etherlink L2 from a single account.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="accent" full onClick={() => navigate('/create')}>Create a new wallet</Button>
          <Button variant="ghost" full onClick={() => navigate('/import')}>I have a recovery phrase</Button>
        </div>
      </div>
    </div>
  );
}
