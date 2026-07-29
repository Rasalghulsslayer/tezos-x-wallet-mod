/**
 * Home — the wallet's landing screen. A brand top bar (logo + Testnet badge,
 * refresh + lock actions), the unified AccountHeader, the total XTZ balance with
 * a hide toggle, Send/Receive quick actions, a faucet shortcut, then the asset
 * list (native XTZ + registered ERC-20s) and an add-token affordance. All data
 * comes from useWallet(); the pure tx/ components render it.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import { fmtXtz } from '../ui/format';
import { Icon } from '../ui/icon';
import { AccountHeader } from '../ui/tx/AccountHeader';
import { AssetRow } from '../ui/tx/AssetRow';
import { Badge } from '../ui/tx/Badge';
import { ErrorCard } from '../ui/tx/ErrorCard';
import { IconBtn } from '../ui/tx/IconBtn';
import { LogoMark } from '../ui/tx/LogoMark';
import { Spinner } from '../ui/tx/Spinner';
import { TezosGlyph } from '../ui/tx/TezosGlyph';
import { useWallet } from '../wallet/context';

export function Home(): React.JSX.Element {
  const ctx = useWallet();
  const acc = ctx.activeAccount;
  const [hidden, setHidden] = useState(false);
  const balances = ctx.balances;
  const bal = balances.data;
  const tokens = ctx.tokens.data ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <LogoMark size={22} />
          <Text style={styles.brandName}>Tezos X</Text>
          <Badge variant="testnet">Testnet</Badge>
        </View>
        <View style={styles.grow} />
        <View style={styles.actions}>
          <IconBtn name="refresh" label="Refresh" onPress={() => ctx.refreshData()} />
          <IconBtn name="lock" label="Lock" onPress={ctx.lock} />
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <AccountHeader account={acc} label={ctx.labelFor(acc)} onOpen={() => ctx.openSwitcher()} copyAddr={ctx.copy} />

        <View style={styles.balance}>
          <Text style={styles.kicker}>Total balance</Text>
          {balances.loading && bal == null ? (
            <View style={styles.balLoading}>
              <Spinner />
            </View>
          ) : (
            <>
              <View style={styles.num}>
                <Text style={styles.numValue}>{hidden ? '••••••' : fmtXtz(bal?.xtz ?? '0')}</Text>
                <View style={styles.numUnit}>
                  <TezosGlyph size={fontSize.xl} color={colors.fgMuted} />
                  <Text style={styles.numUnitLabel}>XTZ</Text>
                </View>
              </View>
              <Pressable style={styles.hide} onPress={() => setHidden((h) => !h)}>
                <Icon name={hidden ? 'eye-off' : 'eye'} size={13} color={colors.fgSubtle} />
                <Text style={styles.hideText}>{hidden ? 'Show' : 'Hide'}</Text>
              </Pressable>
            </>
          )}
        </View>

        {balances.error != null && (
          <View style={styles.errWrap}>
            <ErrorCard title={balances.error.title} detail={balances.error.detail} />
          </View>
        )}

        <View style={styles.homeActions}>
          <Pressable
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={() => ctx.nav.push('send')}
          >
            <View style={styles.actionIco}>
              <Icon name="arrow-up-right" size={16} color={colors.purpleText} />
            </View>
            <Text style={styles.actionLabel}>Send</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={() => ctx.nav.push('receive')}
          >
            <View style={styles.actionIco}>
              <Icon name="arrow-down-left" size={16} color={colors.purpleText} />
            </View>
            <Text style={styles.actionLabel}>Receive</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.faucet, pressed && styles.faucetPressed]}
          onPress={() => ctx.toast('Opening faucet…')}
        >
          <Icon name="info" size={13} color={colors.fgMuted} />
          <Text style={styles.faucetText}>Need test XTZ? Faucet</Text>
          <Icon name="external-link" size={12} color={colors.fgMuted} />
        </Pressable>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Assets</Text>
        </View>
        <AssetRow
          asset={{ kind: 'xtz', symbol: 'XTZ' }}
          balance={fmtXtz(bal?.xtz ?? '0')}
          hidden={hidden}
          onPress={() => ctx.nav.push('receive')}
        />
        {tokens.map((t) => (
          <AssetRow
            key={t.address}
            asset={{ kind: 'token', symbol: t.symbol }}
            balance={fmtXtz(bal?.tokens[t.address.toLowerCase()] ?? '0', 2, 2)}
            hidden={hidden}
            onPress={() => ctx.nav.push('tokens')}
          />
        ))}
        <Pressable
          style={({ pressed }) => [styles.addToken, pressed && styles.addTokenPressed]}
          onPress={() => ctx.nav.push('addToken')}
        >
          <Icon name="plus" size={15} color={colors.fgMuted} />
          <Text style={styles.addTokenText}>Add token</Text>
        </Pressable>
        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
  topbar: {
    height: 54,
    paddingLeft: 12,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 2 },
  brandName: { fontSize: fontSize.md, fontWeight: '600', color: colors.fg },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  scroll: { flex: 1, minHeight: 0 },

  balance: { paddingTop: 22, paddingHorizontal: space[5], paddingBottom: 6, alignItems: 'center' },
  balLoading: { height: 66, alignItems: 'center', justifyContent: 'center' },
  errWrap: { paddingHorizontal: space[4], paddingTop: 6 },
  kicker: {
    fontSize: 11,
    letterSpacing: 0.99,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
  },
  num: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 8 },
  numValue: {
    fontSize: fontSize['4xl'],
    fontWeight: '600',
    letterSpacing: -1.2,
    color: colors.fg,
    fontVariant: ['tabular-nums'],
  },
  numUnit: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  numUnitLabel: { fontSize: fontSize.xl, color: colors.fgMuted, fontWeight: '500' },
  hide: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  hideText: { color: colors.fgSubtle, fontSize: fontSize.xs },

  homeActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: space[4],
    paddingTop: 14,
    paddingBottom: 6,
  },
  action: {
    flex: 1,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionPressed: { backgroundColor: colors.surface2 },
  actionIco: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.purpleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.fg },

  faucet: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  faucetPressed: { backgroundColor: colors.surface3 },
  faucetText: { color: colors.fgMuted, fontSize: fontSize.sm },

  sectionHead: {
    paddingHorizontal: space[5],
    paddingTop: space[5],
    paddingBottom: space[2],
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.99,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
  },

  addToken: {
    marginTop: 10,
    marginHorizontal: space[5],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addTokenPressed: { backgroundColor: colors.surface2 },
  addTokenText: { color: colors.fgMuted, fontSize: fontSize.sm, fontWeight: '500' },
  bottomPad: { height: 20 },
});
