/**
 * Home screen: renders the unlocked account (via the shared accountCardVM) and
 * its real balances from previewnet. The Gate hands us state network-free, so
 * for a Tezos account the EVM alias may not be resolved yet — we derive it here
 * asynchronously (it's needed only for the L2 face and ERC-20 token balances).
 * L1 XTZ (TzKT) loads immediately from the tz1; the alias and token balances
 * fill in when ready. (No L2-XTZ row for Tezos accounts — the kernel's
 * AliasForwarder keeps it at ~0.)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';
import { accountCardVM } from '@tezosx/wallet-core/view-models/account-card-vm';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@tezosx/wallet-core/adapters/tezos/tezos-balance-fetcher';
import { listRegisteredTokens } from '@tezosx/wallet-core/use-cases/list-registered-tokens';
import { mutezToXtz, weiToXtz, formatTokenAmount, shortAddr } from '@tezosx/wallet-core/shared/format';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import { tokenStore, evmAliasCache } from '../composition/wiring';
import {
  initWalletKit,
  pairWithUri,
  proposalPeerName,
  proposalPeerUrl,
  type SessionProposal,
} from '../transport/walletconnect';
import { colors } from '../theme';

interface TokenRow { symbol: string; amount: string; }

export function Home({ state, onLock }: { state: VaultStateUnlocked; onLock: () => void }): React.JSX.Element {
  // For a Tezos account the alias may arrive empty from the network-free Gate read.
  const [alias, setAlias] = useState<string | null>(
    state.kind === 'tezos' ? (state.evmAlias || null) : null,
  );
  const [xtz, setXtz] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WalletConnect: paste a dApp's wc: URI, pair, and surface the proposal. This
  // proves the connection path on-device; approving the session comes next.
  const [wcUri, setWcUri] = useState('');
  const [wcStatus, setWcStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SessionProposal | null>(null);

  useEffect(() => {
    initWalletKit({ onProposal: setProposal }).catch((e) => {
      const f = formatError(e);
      setWcStatus(`WalletConnect init failed — ${f.detail}`);
    });
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    setProposal(null);
    setWcStatus('Pairing…');
    try {
      await pairWithUri(wcUri);
      setWcStatus('Paired — waiting for the dApp proposal…');
    } catch (e) {
      const f = formatError(e);
      setWcStatus(`${f.title} — ${f.detail}`);
    }
  }, [wcUri]);

  // Resolve the EVM alias asynchronously (Tezos only) — never blocks the screen.
  useEffect(() => {
    if (state.kind !== 'tezos' || alias != null) return;
    let live = true;
    deriveEvmAlias(state.tz1)
      .then((a) => { if (live) { evmAliasCache.value = a; setAlias(a); } })
      .catch(() => { /* alias stays pending; L1 balance still shows */ });
    return () => { live = false; };
  }, [state, alias]);

  // L1 XTZ (Tezos) or L2 XTZ (EVM) — loads immediately, no alias needed.
  const refreshXtz = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setXtz(
        state.kind === 'tezos'
          ? mutezToXtz(await fetchL1XtzBalance(state.tz1))
          : weiToXtz(await fetchXtzBalance(state.address)),
      );
    } catch (e) {
      const f = formatError(e);
      setError(`${f.title} — ${f.detail}`);
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => { void refreshXtz(); }, [refreshXtz]);

  // ERC-20 token balances need the alias; fetch once it resolves.
  useEffect(() => {
    if (state.kind !== 'tezos' || alias == null) return;
    let live = true;
    void (async () => {
      try {
        const registered = await listRegisteredTokens({ accountId: state.accountId }, { tokenStore });
        const rows = await Promise.allSettled(
          registered.map(async (t): Promise<TokenRow> => ({
            symbol: t.symbol,
            amount: formatTokenAmount(await fetchErc20Balance(t.address, alias), t.decimals),
          })),
        );
        if (live) setTokens(rows.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
      } catch { /* tokens are best-effort */ }
    })();
    return () => { live = false; };
  }, [state, alias]);

  const vm = accountCardVM(state.kind === 'tezos' ? { ...state, evmAlias: alias ?? '' } : state);

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

      <Pressable style={styles.refresh} disabled={loading} onPress={() => void refreshXtz()}>
        <Text style={styles.refreshText}>Refresh</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.kicker}>WalletConnect</Text>
        <TextInput
          style={styles.wcInput}
          value={wcUri}
          onChangeText={setWcUri}
          placeholder="Paste a wc: URI"
          placeholderTextColor={colors.fgMuted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Pressable
          style={[styles.refresh, wcUri.trim() === '' && styles.refreshDisabled]}
          disabled={wcUri.trim() === ''}
          onPress={() => void connect()}
        >
          <Text style={styles.refreshText}>Connect</Text>
        </Pressable>
        {wcStatus != null && <Text style={styles.wcStatus}>{wcStatus}</Text>}
        {proposal != null && (
          <View style={styles.wcProposal}>
            <Text style={styles.wcProposalName}>{proposalPeerName(proposal)}</Text>
            <Text style={styles.wcProposalUrl}>{proposalPeerUrl(proposal)}</Text>
            <Text style={styles.wcProposalHint}>Session proposal received.</Text>
          </View>
        )}
      </View>
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
        <Text style={styles.faceAddr}>{address === '' ? 'resolving…' : shortAddr(address)}</Text>
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
  refreshDisabled: { opacity: 0.4 },
  refreshText: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  wcInput:   { color: colors.fg, fontSize: 13, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 56 },
  wcStatus:  { color: colors.fgMuted, fontSize: 13 },
  wcProposal: { borderColor: colors.cyan, borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  wcProposalName: { color: colors.fg, fontSize: 15, fontWeight: '700' },
  wcProposalUrl:  { color: colors.cyan, fontSize: 13 },
  wcProposalHint: { color: colors.fgMuted, fontSize: 12 },
});
