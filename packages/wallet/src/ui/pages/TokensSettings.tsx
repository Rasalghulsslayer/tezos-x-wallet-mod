/**
 * TokensSettings: lists the active account's registered ERC-20 tokens with a
 * Remove button per row (disabled on builtin entries — CT4 seeds USDC).
 * Top action navigates to /tokens/add.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/shared/messages';
import type { RegisteredToken } from '@/domain/token';
import { sendPopupRequest } from '@/shared/messaging';
import { shortAddr } from '@/shared/format';
import { formatError } from '@/domain/error';
import { TopBar } from '../tx/TopBar';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { AssetMark } from '../tx/AssetMark';
import { EmptyState } from '../tx/EmptyState';
import { errorToast, toast } from '../tx/Toast';

export function TokensSettings({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<RegisteredToken[] | null>(null);

  const refresh = async () => {
    try {
      const list = await sendPopupRequest<RegisteredToken[]>({ type: 'LIST_REGISTERED_TOKENS' });
      setTokens(list);
    } catch (e) {
      errorToast({ message: formatError(e).title });
    }
  };

  useEffect(() => { if (state.status === 'unlocked') void refresh(); }, [state.status]);

  if (state.status !== 'unlocked') return null;

  const remove = async (token: RegisteredToken) => {
    try {
      await sendPopupRequest({ type: 'REMOVE_CUSTOM_TOKEN', address: token.address });
      toast(`${token.symbol} removed`);
      await refresh();
    } catch (e) {
      errorToast({ message: formatError(e).title });
    }
  };

  return (
    <div className="tx-page">
      <TopBar
        title="Manage tokens"
        onBack={() => navigate(-1)}
        right={
          <Button variant="ghost" size="sm" leftIcon={<Icon name="plus" size={14} />} onClick={() => navigate('/tokens/add')}>
            Add
          </Button>
        }
      />

      <div className="tx-page-scroll">
        {tokens == null ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-fg-muted)', fontSize: 13 }}>Loading…</div>
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={<Icon name="plus" size={22} color="var(--tx-fg-muted)" />}
            title="No tokens yet"
            detail="Add an ERC-20 contract address to surface its balance on Home and its transfers in Activity."
            action={{ label: 'Add token', onClick: () => navigate('/tokens/add'), icon: <Icon name="plus" size={11} /> }}
          />
        ) : (
          <div>
            {tokens.map((t) => (
              <div key={t.address} className="tx-token-row">
                <AssetMark asset={toErc20Asset(t)} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.symbol}</div>
                  <div className="tx-mono" style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>{shortAddr(t.address, 8, 6)}</div>
                </div>
                <span title={t.builtin === true ? 'Cannot remove the default token' : undefined}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void remove(t)}
                    disabled={t.builtin === true}
                  >
                    Remove
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toErc20Asset(t: RegisteredToken) {
  return {
    kind:     'erc20' as const,
    address:  t.address,
    symbol:   t.symbol,
    name:     t.name,
    decimals: t.decimals,
    runtime:  'evm' as const,
  };
}
