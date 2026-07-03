/**
 * use-account-data — the per-account read effect behind the WalletContext seam.
 * For the active unlocked account it fetches balances (L1 XTZ or EVM XTZ + each
 * registered ERC-20), the token registry, and the merged activity feed, exposing
 * each as an AsyncData<T> (data / loading / error) the screens render directly.
 * Keyed on the active account (+ a refresh nonce): switching accounts or locking
 * cancels the in-flight fetch and re-scopes; all network I/O stays below the seam
 * in the core adapters, never in the screens.
 */

import { useEffect, useState } from 'react';
import type { VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import type { ActivityPage } from '@tezosx/wallet-core/domain/activity';
import { formatError, type FormattedError } from '@tezosx/wallet-core/domain/error';
import { mutezToXtz, weiToXtz, formatTokenAmount } from '@tezosx/wallet-core/shared/format';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@tezosx/wallet-core/adapters/tezos/tezos-balance-fetcher';
import { listRegisteredTokens } from '@tezosx/wallet-core/use-cases/list-registered-tokens';
import { listActivity } from '@tezosx/wallet-core/use-cases/list-activity';
import { tokenStore, deps } from '../composition/wiring';
import { toActivityRowVM, type ActivityRowVM } from './activity-vm';

export interface AsyncData<T> {
  data: T | null;
  loading: boolean;
  error: FormattedError | null;
}

/** Displayed native balance (already decimal) + per-token decimal balances keyed by lowercased address. */
export interface BalancesView {
  xtz: string;
  tokens: Record<string, string>;
}

export interface ActivityView {
  items: ActivityRowVM[];
  staleness: ActivityPage['staleness'];
}

export interface AccountData {
  balances: AsyncData<BalancesView>;
  tokens: AsyncData<RegisteredToken[]>;
  activity: AsyncData<ActivityView>;
}

const IDLE = { data: null, loading: false, error: null } as const;

export function useAccountData(active: VaultStateUnlocked | null, nonce: number): AccountData {
  const [balances, setBalances] = useState<AsyncData<BalancesView>>(IDLE);
  const [tokens, setTokens] = useState<AsyncData<RegisteredToken[]>>(IDLE);
  const [activity, setActivity] = useState<AsyncData<ActivityView>>(IDLE);

  useEffect(() => {
    if (active == null) {
      setBalances(IDLE);
      setTokens(IDLE);
      setActivity(IDLE);
      return;
    }

    let live = true;
    const accountId = active.accountId;
    const holder = active.kind === 'tezos' ? active.evmAlias : active.address;

    // Tokens + balances: the registry is fetched first so we know which ERC-20
    // balances to read; a failing token balance falls back to '0' without
    // failing the whole read (the native balance still resolves).
    setBalances((s) => ({ data: s.data, loading: true, error: null }));
    setTokens((s) => ({ data: s.data, loading: true, error: null }));
    void (async () => {
      try {
        const list = await listRegisteredTokens({ accountId }, { tokenStore });
        if (!live) return;
        setTokens({ data: list, loading: false, error: null });

        const rawXtz = active.kind === 'tezos'
          ? await fetchL1XtzBalance(active.tz1)
          : await fetchXtzBalance(active.address);
        const xtz = active.kind === 'tezos' ? mutezToXtz(rawXtz) : weiToXtz(rawXtz);

        const tokenBalances: Record<string, string> = {};
        if (holder !== '') {
          await Promise.all(list.map(async (t) => {
            try {
              tokenBalances[t.address.toLowerCase()] = formatTokenAmount(
                await fetchErc20Balance(t.address, holder),
                t.decimals,
              );
            } catch {
              tokenBalances[t.address.toLowerCase()] = '0';
            }
          }));
        }
        if (!live) return;
        setBalances({ data: { xtz, tokens: tokenBalances }, loading: false, error: null });
      } catch (e) {
        if (!live) return;
        const fe = formatError(e);
        setTokens((s) => ({ data: s.data, loading: false, error: fe }));
        setBalances({ data: null, loading: false, error: fe });
      }
    })();

    // Activity needs the warm container for the active account. The provider
    // rebuilds it on unlock / switch before this effect re-runs, so a null here
    // means "not ready yet" → an empty (non-error) feed.
    const container = deps.state.container;
    if (container == null) {
      setActivity({ data: { items: [], staleness: 'fresh' }, loading: false, error: null });
    } else {
      setActivity((s) => ({ data: s.data, loading: true, error: null }));
      void (async () => {
        try {
          const page = await listActivity({}, { container });
          if (!live) return;
          setActivity({
            data: { items: page.items.map(toActivityRowVM), staleness: page.staleness },
            loading: false,
            error: null,
          });
        } catch (e) {
          if (!live) return;
          setActivity({ data: null, loading: false, error: formatError(e) });
        }
      })();
    }

    return () => { live = false; };
    // Addresses are invariant for a given (accountId, kind); re-scope only on
    // account switch or an explicit refresh, not on every getState identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.accountId, active?.kind, nonce]);

  return { balances, tokens, activity };
}
