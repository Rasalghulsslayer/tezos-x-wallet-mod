import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/lib/messages';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { EmptyState } from '../tx/EmptyState';

export function Activity({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  if (state.status !== 'unlocked') return null;

  return (
    <div className="tx-page">
      <TopBar title="Activity" />
      <div className="tx-page-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        <EmptyState
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title="No activity yet"
          detail="Send or receive XTZ and your transactions will show up here."
          action={{
            label: 'Receive',
            icon: (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            ),
            onClick: () => navigate('/receive'),
          }}
        />
      </div>
      <BottomTabs />
    </div>
  );
}
