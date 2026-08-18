import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState, AccountSummary } from '@tezosx/wallet-core/shared/messages';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@tezosx/wallet-core/adapters/tezos/tezos-balance-fetcher';
import { FAUCET_URL } from '@tezosx/wallet-core/shared/constants';
import { mutezToXtz, weiToXtz } from '@tezosx/wallet-core/shared/format';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { AccountHeader } from '../tx/AccountHeader';
import { LogoMark } from '../tx/LogoMark';
import { AccountSwitcher } from '../tx/AccountSwitcher';
import { RenameModal } from '../tx/RenameModal';
import { RemoveAccountModal } from '../tx/RemoveAccountModal';
import { IconBtn } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { AssetRow } from '../tx/AssetRow';
import { assetRowVM } from '../view-models/asset-row-vm';
import { XTZ_L1_ASSET, XTZ_L2_ASSET, type Erc20Asset } from '@tezosx/wallet-core/domain/asset';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import { TopBar } from '../tx/TopBar';
import { BottomTabs } from '../tx/BottomTabs';
import { Badge } from '../tx/Badge';
import { errorToast } from '../tx/Toast';

const isSidePanel = new URLSearchParams(window.location.search).get('mode') === 'side';

export function Home({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();
  const [xtz, setXtz]                   = useState<string | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AccountSummary | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AccountSummary | null>(null);
  const [customTokens, setCustomTokens] = useState<RegisteredToken[]>([]);
  /** Map<lowercased token address, formatted balance string>. Empty when not yet loaded. */
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});

  const refresh = async () => {
    if (state.status !== 'unlocked') return;
    const xtzAddress = state.kind === 'tezos' ? state.tz1     : state.address;
    const evmAddress = state.kind === 'tezos' ? state.evmAlias : state.address;

    const xtzFetch = state.kind === 'tezos'
      ? fetchL1XtzBalance(xtzAddress).then(mutezToXtz)
      : fetchXtzBalance(xtzAddress).then(weiToXtz);

    const tokens = await sendPopupRequest<RegisteredToken[]>({ type: 'LIST_REGISTERED_TOKENS' }).catch(() => [] as RegisteredToken[]);
    setCustomTokens(tokens);

    // The EVM alias of a tz1 account may still be resolving (first unlock, or
    // offline). Skip the EVM-side ERC-20 reads until it lands — the rows show
    // a dash — and let the effect below re-run when a state re-poll delivers it.
    const tokenFetches = evmAddress == null ? [] : tokens.map((t) =>
      fetchErc20Balance(t.address, evmAddress).then((hex) => [t.address.toLowerCase(), hex] as const),
    );

    const [xtzRes, ...tokenRes] = await Promise.allSettled([
      xtzFetch,
      ...tokenFetches,
    ]);
    if (xtzRes.status === 'rejected') console.error('[Home] XTZ fetch failed', xtzRes.reason);

    setXtz(xtzRes.status === 'fulfilled' ? xtzRes.value : '—');

    const balances: Record<string, string> = {};
    for (const r of tokenRes) {
      if (r.status === 'fulfilled') balances[r.value[0]] = r.value[1];
    }
    setTokenBalances(balances);

    if (xtzRes.status === 'rejected') {
      const e = formatError(xtzRes.reason);
      errorToast({
        message:   e.title,
        secondary: e.code === 'rpc-unreachable' ? '· network'
                 : e.code === 'rpc-timeout'     ? '· timeout'
                 : undefined,
        retry:     () => void refresh(),
      });
    }
  };

  const activeKind = state.status === 'unlocked' ? state.kind : null;
  // The alias term makes the balances re-fetch when the background backfill
  // resolves it (null → 0x…) and the Gate's re-poll delivers the new state.
  const activeEvmAlias = state.status === 'unlocked' && state.kind === 'tezos' ? state.evmAlias : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, [state.status, activeKind, activeEvmAlias]);

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onChanged();
  };

  if (state.status !== 'unlocked') return null;

  const sortedAccounts = state.accounts.slice().sort((a, b) => a.createdAt - b.createdAt);
  const switchable     = sortedAccounts.length >= 2;
  const activeIdx      = sortedAccounts.findIndex((a) => a.id === state.accountId);
  const activeSummary  = activeIdx >= 0 ? sortedAccounts[activeIdx] : undefined;
  const activeLabel    = activeSummary?.label?.trim()
    || (activeSummary != null ? `Account ${activeIdx + 1}` : 'Account');

  const fmtBalance = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  // '—' is the failed-fetch sentinel: it must render as-is, never be parsed
  // into a false "0.00" balance. null = still loading.
  const xtzDisplay = xtz == null || xtz === '—' ? '—' : fmtBalance(parseFloat(xtz) || 0);
  const isEvm      = state.kind === 'evm';

  const setActive = async (id: AccountId) => {
    setSwitcherOpen(false);
    if (id === state.accountId) return;
    try {
      await sendPopupRequest({ type: 'SET_ACTIVE_ACCOUNT', accountId: id });
      onChanged();
    } catch (e) {
      errorToast({ message: formatError(e).title });
    }
  };

  const saveRename = async (label: string) => {
    if (renameTarget == null) return;
    await sendPopupRequest({ type: 'RENAME_ACCOUNT', accountId: renameTarget.id, label });
    onChanged();
  };

  const confirmRemove = async (password: string) => {
    if (removeTarget == null) return;
    await sendPopupRequest({ type: 'REMOVE_ACCOUNT', accountId: removeTarget.id, password });
    onChanged();
  };

  return (
    <div className="tx-page">
      <TopBar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={18} />
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
        <div style={{ position: 'relative' }}>
          <AccountHeader
            state={state}
            displayLabel={activeLabel}
            onSwitcherOpen={switchable ? () => setSwitcherOpen(true) : undefined}
            onAddAccount={!switchable ? () => navigate('/accounts/add') : undefined}
          />

          {switcherOpen && (
            <AccountSwitcher
              state={state}
              onClose={() => setSwitcherOpen(false)}
              onSetActive={(id) => void setActive(id)}
              onRename={(id) => {
                setRenameTarget(sortedAccounts.find((a) => a.id === id) ?? null);
                setSwitcherOpen(false);
              }}
              onRemove={(id) => {
                setRemoveTarget(sortedAccounts.find((a) => a.id === id) ?? null);
                setSwitcherOpen(false);
              }}
              onAdd={() => {
                setSwitcherOpen(false);
                navigate('/accounts/add');
              }}
            />
          )}
        </div>

        <div className="tx-home-balance">
          <div className="kicker">Balance</div>
          <div className="num">
            <span>{balanceHidden ? '••••••' : xtzDisplay}</span>
            <span className="unit">XTZ</span>
          </div>
          <button
            type="button"
            className="hide-toggle"
            onClick={() => setBalanceHidden((h) => !h)}
            aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
          >
            <Icon name={balanceHidden ? 'eye-off' : 'eye'} size={11} />
            {balanceHidden ? 'Show' : 'Hide'}
          </button>
        </div>

        <div className="tx-home-actions">
          <button type="button" onClick={() => navigate('/send')}>
            <span className="ico"><Icon name="arrow-up-right" size={14} /></span>
            Send
          </button>
          <button type="button" onClick={() => navigate('/receive')}>
            <span className="ico"><Icon name="arrow-down-left" size={14} /></span>
            Receive
          </button>
        </div>

        <button
          type="button"
          className="tx-home-faucet"
          onClick={() => window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')}
        >
          <span className="ico"><Icon name="info" size={11} /></span>
          Need test XTZ? Faucet
          <Icon name="external-link" size={10} />
        </button>

        <div className="tx-home-assets-head">
          <span className="kicker">Assets</span>
        </div>

        <AssetRow
          vm={assetRowVM(isEvm ? XTZ_L2_ASSET : XTZ_L1_ASSET, null)}
          displayBalance={balanceHidden ? '••••' : xtzDisplay}
        />

        {customTokens.map((t) => {
          const asset: Erc20Asset = {
            kind: 'erc20', address: t.address, symbol: t.symbol, name: t.name,
            decimals: t.decimals, runtime: 'evm',
          };
          const rawHex = tokenBalances[t.address.toLowerCase()];
          return (
            <AssetRow
              key={t.address}
              vm={assetRowVM(asset, rawHex ?? null)}
              displayBalance={balanceHidden ? '••••' : (rawHex != null ? assetRowVM(asset, rawHex).balanceFormatted : '—')}
            />
          );
        })}

        <button
          type="button"
          className="tx-home-add-token"
          onClick={() => navigate('/tokens/add')}
        >
          <Icon name="plus" size={13} />
          <span>Add token</span>
        </button>

        <div style={{ height: 24 }} />
      </div>

      <BottomTabs />

      {renameTarget != null && (
        <RenameModal
          accountId={renameTarget.id}
          initialLabel={renameTarget.label ?? ''}
          onClose={() => setRenameTarget(null)}
          onSaved={saveRename}
        />
      )}

      {removeTarget != null && (
        <RemoveAccountModal
          account={removeTarget}
          isLast={state.accounts.length === 1}
          onClose={() => setRemoveTarget(null)}
          onConfirmed={confirmRemove}
        />
      )}
    </div>
  );
}
