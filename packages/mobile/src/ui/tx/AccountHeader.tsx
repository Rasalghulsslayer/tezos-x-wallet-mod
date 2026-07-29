/**
 * AccountHeader — the unified account card (mirrors mobile.css .account-header).
 * A top accent bar (purple→cyan for a Tezos account, cyan for an EVM account),
 * the identicon + label + runtime line, a switcher chevron, and the address
 * rows: a Tezos account shows both its L1 tz1 and its L2 alias; an EVM account
 * shows its single 0x. Tapping the card (or the chevron) opens the switcher.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, fontSize, radius } from '../../theme';
import type { ViewAccount } from '../../wallet/view-account';
import { Icon } from '../icon';
import { Identicon } from './Identicon';
import { AddrRow } from './AddrRow';

export function AccountHeader({
  account,
  label,
  onOpen,
  copyAddr,
}: {
  account: ViewAccount;
  label: string;
  onOpen: () => void;
  copyAddr?: (addr: string) => void;
}): React.JSX.Element {
  const isEvm = account.kind === 'evm';

  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <AccentBar runtime={isEvm ? 'l2' : null} />
      <View style={styles.top}>
        <Identicon seed={account.identitySeed} size={40} />
        <View style={styles.name}>
          <Text style={styles.nameText} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.kind} numberOfLines={1}>
            {isEvm ? 'EVM runtime · 0x' : 'Michelson runtime · tz1 + alias'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch account"
          onPress={onOpen}
          style={styles.switch}
        >
          <Icon name="chevron-down" size={18} color={colors.fgMuted} />
        </Pressable>
      </View>
      <View style={styles.addrs}>
        {isEvm ? (
          <AddrRow chain="l2" addr={account.address ?? ''} copyAddr={copyAddr} />
        ) : (
          <>
            <AddrRow chain="l1" addr={account.tz1 ?? ''} copyAddr={copyAddr} />
            <AddrRow chain="l2" addr={account.evmAlias ?? ''} copyAddr={copyAddr} />
          </>
        )}
      </View>
    </Pressable>
  );
}

function AccentBar({ runtime }: { runtime: 'l1' | 'l2' | null }): React.JSX.Element {
  return (
    <Svg style={styles.accent} height={2} width="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="ah-accent" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.purple} />
          <Stop offset="1" stopColor={colors.cyan} />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width="100%"
        height={2}
        fill={runtime === 'l1' ? colors.purple : runtime === 'l2' ? colors.cyan : 'url(#ah-accent)'}
        opacity={runtime == null ? 0.6 : 0.7}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    overflow: 'hidden',
    gap: 14,
  },
  accent: { position: 'absolute', left: 0, right: 0, top: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, minWidth: 0 },
  nameText: { fontSize: fontSize.md, fontWeight: '600', letterSpacing: -0.15, color: colors.fg },
  kind: { fontSize: fontSize.xs, color: colors.fgMuted, marginTop: 1 },
  switch: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addrs: { gap: 8 },
});
