/**
 * Home screen: renders the unlocked account (via the shared accountCardVM) and
 * its real balances read from previewnet. For a Tezos account: L1 XTZ (TzKT) +
 * ERC-20 tokens held on the EVM alias. (No L2-XTZ row for Tezos accounts — the
 * kernel's AliasForwarder keeps it at ~0.) For an EVM account: L2 XTZ balance.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';
import { accountCardVM } from '@tezosx/wallet-core/view-models/account-card-vm';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@tezosx/wallet-core/adapters/tezos-balance-fetcher';
import { listRegisteredTokens } from '@tezosx/wallet-core/use-cases/list-registered-tokens';
import { mutezToXtz, weiToXtz, formatTokenAmount, shortAddr } from '@tezosx/wallet-core/shared/format';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { tokenStore } from '../composition/wiring';
import { colors } from '../theme';

interface TokenRow { symbol: string; amount: string; }

export function Home({ state, onLock }: { state: VaultStateUnlocked; onLock: () => void }): React.JSX.Element {
  const vm = accountCardVM(state);
  const [xtz, setXtz] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (state.kind === 'tezos') {
        setXtz(mutezToXtz(await fetchL1XtzBalance(state.tz1)));
        const registered = await listRegisteredTokens({ accountId: state.accountId }, { tokenStore });
        const results = await Promise.allSettled(
          registered.map(async (t): Promise<TokenRow> => ({
            symbol: t.symbol,
            amount: formatTokenAmount(await fetchErc20Balance(t.address, state.evmAlias), t.decimals),
          })),
        );
        setTokens(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
      } else {
        setXtz(weiToXtz(await fetchXtzBalance(state.address)));
      }
    } catch (e) {
      const f = formatError(e);
      setError(`${f.title} — ${f.detail}`);
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Wallet</Text>
        <Pressable onPress={onLock}><Text style={styles.lock}>Lock</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Face chain={vm.primary.chain} label={vm.primary.label} address={vm.primary.address} />
        {vm.secondary != null && (
          <Face chain={vm.secondary.chain} label={vm.secondary.label} address={vm.secondary.address} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>Balance</Text>
        {loading ? (
          <ActivityIndicator color={colors.purple} />
        ) : (
          <>
            <Text style={styles.balance}>{xtz ?? '—'} ꜩ</Text>
            {tokens.map((t) => (
              <Text key={t.symbol} style={styles.token}>{t.amount} {t.symbol}</Text>
            ))}
          </>
        )}
        {error != null && <Text style={styles.error}>{error}</Text>}
      </View>

      <Pressable style={styles.refresh} disabled={loading} onPress={() => void refresh()}>
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}

function Face({ chain, label, address }: { chain: 'l1' | 'l2'; label: string; address: string }): React.JSX.Element {
  return (
    <View style={styles.face}>
      <View style={[styles.pill, { backgroundColor: chain === 'l1' ? colors.purple : colors.cyan }]}>
        <Text style={styles.pillText}>{chain === 'l1' ? 'L1' : 'L2'}</Text>
      </View>
      <View>
        <Text style={styles.faceLabel}>{label}</Text>
        <Text style={styles.faceAddr}>{shortAddr(address)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 72, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:     { color: colors.fg, fontSize: 24, fontWeight: '700' },
  lock:      { color: colors.fgMuted, fontSize: 15 },
  card:      { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 12 },
  face:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill:      { borderRadius: 9999, paddingVertical: 3, paddingHorizontal: 8 },
  pillText:  { color: colors.bg, fontSize: 12, fontWeight: '700' },
  faceLabel: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  faceAddr:  { color: colors.fgMuted, fontSize: 13 },
  kicker:    { color: colors.fgMuted, fontSize: 11, textTransform: 'uppercase' },
  balance:   { color: colors.fg, fontSize: 32, fontWeight: '700' },
  token:     { color: colors.fg, fontSize: 16 },
  error:     { color: colors.danger, fontSize: 14 },
  refresh:   { borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  refreshText: { color: colors.fg, fontSize: 15, fontWeight: '600' },
});
