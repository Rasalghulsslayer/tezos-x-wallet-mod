import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/lib/messages';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { Button } from '../tx/Button';

export function Activity({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  if (state.status !== 'unlocked') return null;

  return (
    <div className="tx-page">
      <TopBar title="Activity" />
      <div className="tx-page-scroll">
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>No activity yet</div>
          <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', marginTop: 6, maxWidth: 260, margin: '6px auto 0' }}>
            Send or receive XTZ to get started. Transaction history will appear here in a future version.
          </div>
          <div style={{ marginTop: 14 }}>
            <Button variant="outline" onClick={() => navigate('/receive')}>Receive</Button>
          </div>
        </div>
      </div>
      <BottomTabs />
    </div>
  );
}
