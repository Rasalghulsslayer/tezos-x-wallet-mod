import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/lib/messages';
import { fetchL1XtzBalance, fetchErc20Balance } from '@/lib/balances';
import { USDC_CONTRACT, FAUCET_URL } from '@/lib/constants';
import { mutezToXtz, formatUsdc } from '@/lib/format';
import { sendPopupRequest } from '@/lib/messaging';
import { AccountCard } from '../tx/AccountCard';
import { Button, IconBtn } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { AssetMark } from '../tx/AssetMark';
import { ChainPill } from '../tx/ChainPill';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { Badge } from '../tx/Badge';
import { toast } from '../tx/Toast';

interface Balances {
  xtz:  string;   // tz1 balance via the Michelson runtime RPC (the only XTZ balance that exists)
  usdc: string;   // ERC-20 balance on the EVM-alias
}

type AssetFilter = 'all' | 'l1' | 'l2';

export function Home({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();
  const [bal, setBal]     = useState<Balances | null>(null);
  const [loading, setLd]  = useState(true);
  const [error,   setErr] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');

  const refresh = async () => {
    if (state.status !== 'unlocked') return;
    setLd(true);
    setErr(null);
    try {
      // NOTE: we deliberately do NOT fetch eth_getBalance on the EVM alias.
      // Tezos X kernel's AliasForwarder routes any XTZ sent to a 0x alias back
      // to its native tz1, so the L2 alias balance is structurally always 0.
      // Showing it would be misleading. See packages/wallet/CHANGELOG.md 0.4.0.
      const [xtzRes, usdcRes] = await Promise.allSettled([
        fetchL1XtzBalance(state.tz1),
        fetchErc20Balance(USDC_CONTRACT, state.evmAlias),
      ]);
      if (xtzRes.status  === 'rejected') console.error('[Home] L1 XTZ fetch failed', xtzRes.reason);
      if (usdcRes.status === 'rejected') console.error('[Home] USDC fetch failed',  usdcRes.reason);

      const xtz  = xtzRes.status  === 'fulfilled' ? mutezToXtz(xtzRes.value)   : '—';
      const usdc = usdcRes.status === 'fulfilled' ? formatUsdc(usdcRes.value)  : '0.00';
      setBal({ xtz, usdc });

      const firstError =
        xtzRes.status  === 'rejected' ? (xtzRes.reason as Error).message :
        usdcRes.status === 'rejected' ? `USDC: ${(usdcRes.reason as Error).message}` :
        null;
      if (firstError) setErr(firstError);
    } finally {
      setLd(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, [state.status]);

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onChanged();
  };

  if (state.status !== 'unlocked') return null;

  const xtzNum  = bal ? parseFloat(bal.xtz)  || 0 : 0;
  const usdcNum = bal ? parseFloat(bal.usdc) || 0 : 0;
  const fmt2    = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const cycleFilter = () => {
    setAssetFilter((f) => f === 'all' ? 'l1' : f === 'l1' ? 'l2' : 'all');
  };
  const filterLabel =
    assetFilter === 'l1' ? 'Michelson runtime' :
    assetFilter === 'l2' ? 'EVM runtime' :
    'All chains';

  return (
    <div className="tx-page">
      <TopBar
        center={
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="tx-logo-mark" style={{ width: 18, height: 18, borderRadius: 4 }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Tezos X</span>
            <Badge variant="testnet">Testnet</Badge>
          </div>
        }
        title=""
        right={
          <>
            <IconBtn label="Refresh" size="sm" onClick={() => void refresh()}>
              <Icon name="refresh" size={16} />
            </IconBtn>
            <IconBtn label="Lock" size="sm" onClick={lock}>
              <Icon name="lock" size={16} />
            </IconBtn>
            <IconBtn label="Settings" size="sm" onClick={() => navigate('/settings')}>
              <Icon name="settings" size={16} />
            </IconBtn>
          </>
        }
      />

      <div className="tx-page-scroll">
        <div style={{ padding: '12px 16px 0' }}>
          <AccountCard variant="split" tz1={state.tz1} eth={state.evmAlias} />
        </div>

        <div style={{ padding: '20px 16px 12px', textAlign: 'center' }}>
          <div className="tx-kicker" style={{ marginBottom: 8 }}>Total XTZ</div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 500,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{bal ? fmt2(xtzNum) : '—'}</span>
            <span style={{ color: 'var(--tx-fg-muted)', fontWeight: 400, marginLeft: 6 }}>XTZ</span>
          </div>
          {error && (
            <div style={{ fontSize: 11, color: 'var(--tx-danger)', marginTop: 6 }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '4px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Button variant="outline" onClick={() => navigate('/send')} leftIcon={<Icon name="send" size={16} />}>
            Send
          </Button>
          <Button variant="outline" onClick={() => navigate('/receive')} leftIcon={<Icon name="arrow-down-left" size={16} />}>
            Receive
          </Button>
          <Button
            variant="outline"
            leftIcon={<Icon name="plus" size={16} />}
            onClick={() => {
              window.open(FAUCET_URL, '_blank');
              toast('Opening faucet');
            }}
          >
            Faucet
          </Button>
        </div>

        <div className="tx-section-head">
          <span className="t">Assets</span>
          <span className="a" onClick={cycleFilter} role="button" title="Filter by runtime — click to cycle">
            {filterLabel}
          </span>
        </div>
        <div style={{ padding: '0 8px' }}>
          {(assetFilter === 'all' || assetFilter === 'l1') && (
            <div className="tx-row">
              <AssetMark asset="xtz" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tx-row-primary">Tezos</div>
                <div className="tx-row-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ChainPill chain="l1" /> <span className="tx-subtle">XTZ</span>
                </div>
              </div>
              <div className="tx-row-right">
                <div className="amt">{bal ? fmt2(xtzNum) : '—'}</div>
              </div>
            </div>
          )}
          {(assetFilter === 'all' || assetFilter === 'l2') && (
            <div className="tx-row">
              <AssetMark asset="usdc" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tx-row-primary">USD Coin</div>
                <div className="tx-row-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ChainPill chain="l2" /> <span className="tx-subtle">USDC</span>
                </div>
              </div>
              <div className="tx-row-right">
                <div className="amt">{bal ? fmt2(usdcNum) : '—'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="tx-section-head">
          <span className="t">Recent activity</span>
          <span className="a" onClick={() => navigate('/activity')}>See all</span>
        </div>
        <div style={{ padding: '12px 16px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)' }}>
            {loading ? 'Loading…' : 'No activity yet.'}
          </div>
        </div>
      </div>

      <BottomTabs />
    </div>
  );
}
