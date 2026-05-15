import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/shared/messages';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@/adapters/tezos/tezos-balance-fetcher';
import { USDC_CONTRACT, FAUCET_URL } from '@/shared/constants';
import { mutezToXtz, weiToXtz, formatUsdc } from '@/shared/format';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@/domain/error';
import { accountCardVM } from '../view-models/account-card-vm';
import { AccountCard } from '../tx/AccountCard';
import { Button, IconBtn } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { AssetMark } from '../tx/AssetMark';
import { ChainPill } from '../tx/ChainPill';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { Badge } from '../tx/Badge';
import { toast, errorToast } from '../tx/Toast';

interface Balances {
  /** Native XTZ balance for the active runtime (mutez for tz1, wei for 0x). */
  xtz:  string;
  /** ERC-20 USDC balance on the EVM-visible address. */
  usdc: string;
}

type AssetFilter = 'all' | 'l1' | 'l2';

const isSidePanel = new URLSearchParams(window.location.search).get('mode') === 'side';

export function Home({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();
  const [bal, setBal]     = useState<Balances | null>(null);
  const [loading, setLd]  = useState(true);
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');

  const refresh = async () => {
    if (state.status !== 'unlocked') return;
    setLd(true);
    try {
      const xtzAddress = state.kind === 'tezos' ? state.tz1     : state.address;
      const evmAddress = state.kind === 'tezos' ? state.evmAlias : state.address;

      // Tezos accounts: native XTZ lives on L1; the EVM alias never holds
      // native XTZ (AliasForwarder re-routes it back). EVM-native accounts:
      // native XTZ on L2 via eth_getBalance.
      const xtzFetch = state.kind === 'tezos'
        ? fetchL1XtzBalance(xtzAddress).then(mutezToXtz)
        : fetchXtzBalance(xtzAddress).then(weiToXtz);

      const [xtzRes, usdcRes] = await Promise.allSettled([
        xtzFetch,
        fetchErc20Balance(USDC_CONTRACT, evmAddress).then(formatUsdc),
      ]);
      if (xtzRes.status  === 'rejected') console.error('[Home] XTZ fetch failed',  xtzRes.reason);
      if (usdcRes.status === 'rejected') console.error('[Home] USDC fetch failed', usdcRes.reason);

      const xtz  = xtzRes.status  === 'fulfilled' ? xtzRes.value  : '—';
      const usdc = usdcRes.status === 'fulfilled' ? usdcRes.value : '0.00';
      setBal({ xtz, usdc });

      const reason = xtzRes.status === 'rejected'
        ? xtzRes.reason
        : usdcRes.status === 'rejected'
          ? usdcRes.reason
          : null;
      if (reason != null) {
        const e = formatError(reason);
        errorToast({
          message:   e.title,
          secondary: e.code === 'rpc-unreachable' ? '· network'
                   : e.code === 'rpc-timeout'     ? '· timeout'
                   : undefined,
          retry:     () => void refresh(),
        });
      }
    } finally {
      setLd(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, [state.status, state.status === 'unlocked' ? state.kind : null]);

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onChanged();
  };

  if (state.status !== 'unlocked') return null;

  const vm        = accountCardVM(state);
  const xtzNum    = bal ? parseFloat(bal.xtz)  || 0 : 0;
  const usdcNum   = bal ? parseFloat(bal.usdc) || 0 : 0;
  const fmt2      = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isEvm     = state.kind === 'evm';
  const xtzChain: 'l1' | 'l2' = isEvm ? 'l2' : 'l1';

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
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            {!isSidePanel && (
              <IconBtn
                label="Open in side panel"
                size="sm"
                onClick={async () => {
                  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                  if (tab?.windowId == null) return;
                  await chrome.sidePanel.open({ windowId: tab.windowId });
                  window.close();
                }}
              >
                <Icon name="sidebar" size={16} />
              </IconBtn>
            )}
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
          <AccountCard variant="vm" vm={vm} />
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
          {(assetFilter === 'all' || assetFilter === xtzChain) && (
            <div className="tx-row">
              <AssetMark asset="xtz" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tx-row-primary">Tezos</div>
                <div className="tx-row-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ChainPill chain={xtzChain} /> <span className="tx-subtle">XTZ</span>
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
