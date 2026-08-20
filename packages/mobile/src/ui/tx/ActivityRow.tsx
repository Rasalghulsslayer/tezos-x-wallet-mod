/**
 * ActivityRow — one transaction line in the activity list (mirrors mobile.css
 * .activity + .act-ident). The left disc is the transferred asset's logo
 * (AssetMark) with a direction badge in the corner, wrapped in a
 * runtime-coloured ring: purple (L1), cyan (L2), a purple→cyan sweep (cross),
 * an amber spinner (pending), or a solid danger ring (failed — the badge
 * flips to an ✕). Non-transfer rows (contract call, signature, unknown)
 * center a stroke icon instead of a logo. The middle column carries
 * verb → peer and a runtime tag + relative time (or Pending/Failed); the
 * right column is the signed amount, greyed & struck for failures.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { colors, font, fontSize, space } from '../../theme';
import type { ActivityRowVM } from '../../wallet/activity-vm';
import { timeAgo } from '@tezosx/wallet-core/shared/format';
import { AssetMark } from './AssetMark';
import { Icon, type IconName } from '../icon';

type Ident = 'l1' | 'l2' | 'cross' | 'pending' | 'failed';

export function ActivityRow({
  item,
  now,
  onPress,
}: {
  item: ActivityRowVM;
  now?: number;
  onPress?: () => void;
}): React.JSX.Element {
  const st = item.status;
  const ident: Ident = st === 'pending' ? 'pending' : st === 'failed' ? 'failed' : item.runtime;
  const tag = item.runtime === 'cross' ? 'Cross-runtime' : item.runtime === 'l2' ? 'EVM runtime' : 'Michelson runtime';
  const sign = item.dir === 'in' ? '+' : '−';
  const arrow: IconName = item.dir === 'in' ? 'arrow-down-left' : 'arrow-up-right';

  const amountColor =
    st === 'failed'
      ? colors.fgSubtle
      : st === 'pending'
        ? colors.fgMuted
        : item.dir === 'in'
          ? colors.success
          : colors.fg;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ActIdent ident={ident} item={item} arrow={arrow} />
      <View style={styles.mid}>
        <View style={styles.t1}>
          <Text style={styles.verb}>{item.verb}</Text>
          <Icon name={arrow} size={11} color={colors.fgSubtle} />
          <Text style={styles.peer} numberOfLines={1}>
            {item.peer}
          </Text>
        </View>
        <View style={styles.t2}>
          <Text style={[styles.tag, TAG_COLOR[item.runtime]]}>{tag}</Text>
          <Text style={styles.dotSep}>·</Text>
          {st === 'pending' ? (
            <Text style={styles.pendingTag}>Pending</Text>
          ) : st === 'failed' ? (
            <Text style={styles.failedTag}>Failed</Text>
          ) : (
            <Text style={styles.time}>{timeAgo(item.ts, now)}</Text>
          )}
        </View>
      </View>
      {item.amount !== '' && (
        <View style={styles.amt}>
          <Text style={[styles.amtV, { color: amountColor }, st === 'failed' && styles.strike]}>
            {st === 'failed' ? '' : sign}
            {item.amount} {item.symbol}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function ActIdent({
  ident,
  item,
  arrow,
}: {
  ident: Ident;
  item: ActivityRowVM;
  arrow: 'arrow-down-left' | 'arrow-up-right';
}): React.JSX.Element {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (ident !== 'pending') return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [ident, spin]);

  const coreColor = ident === 'failed' ? colors.danger : colors.fgMuted;

  const ring =
    ident === 'pending' ? (
      <Animated.View
        style={[
          styles.pendingRing,
          { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
        ]}
      />
    ) : (
      <Svg width={40} height={40} viewBox="0 0 40 40" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="act-cross" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.purple} />
            <Stop offset="1" stopColor={colors.cyan} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={20}
          cy={20}
          r={19}
          stroke={
            ident === 'l1'
              ? colors.purple
              : ident === 'l2'
                ? colors.cyan
                : ident === 'failed'
                  ? colors.danger
                  : 'url(#act-cross)'
          }
          strokeWidth={2}
          fill="none"
        />
      </Svg>
    );

  const badge =
    ident === 'failed'          ? { icon: 'x' as const, color: colors.danger } :
    item.kind !== 'transfer'    ? null :
    item.dir === 'in'           ? { icon: 'arrow-down-left' as const, color: colors.success } :
                                  { icon: 'arrow-up-right' as const,  color: colors.fg };

  return (
    <View style={styles.ident}>
      {ring}
      {item.asset != null ? (
        <AssetMark symbol={item.asset.symbol} kind={item.asset.kind === 'xtz' ? 'xtz' : 'token'} size="sm" />
      ) : (
        <View style={styles.core}>
          <Icon name={coreIconOf(item, arrow)} size={16} color={coreColor} />
        </View>
      )}
      {badge != null && (
        <View style={styles.dirBadge}>
          <Icon name={badge.icon} size={9} color={badge.color} strokeWidth={2.75} />
        </View>
      )}
    </View>
  );
}

/** Stroke icon for rows that carry no asset (contract call, signature, …). */
function coreIconOf(item: ActivityRowVM, arrow: IconName): IconName {
  if (item.kind === 'contract-call') return 'code';
  if (item.kind === 'signature')     return 'pen';
  if (item.kind === 'unknown')       return 'list';
  return arrow;
}

const TAG_COLOR: Record<ActivityRowVM['runtime'], { color: string }> = {
  l1:    { color: colors.purpleText },
  l2:    { color: colors.cyanText },
  cross: { color: colors.crossText },
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingHorizontal: space[4],
  },
  pressed: { backgroundColor: colors.surface2 },
  ident: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pendingRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: colors.warning,
    borderRightColor: colors.warning,
  },
  core: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surface3,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, minWidth: 0 },
  t1: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  verb: { color: colors.fgMuted, fontWeight: '500', fontSize: fontSize.md },
  peer: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    color: colors.fg,
  },
  t2: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  tag: { fontSize: fontSize.xs },
  dotSep: { fontSize: fontSize.xs, color: colors.fgSubtle },
  time: { fontSize: fontSize.xs, color: colors.fgSubtle },
  pendingTag: { fontSize: fontSize.xs, color: colors.warning, fontWeight: '600' },
  failedTag: { fontSize: fontSize.xs, color: colors.danger, fontWeight: '600' },
  amt: { alignItems: 'flex-end' },
  amtV: {
    fontSize: fontSize.md,
    fontWeight: '500',
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
  },
  strike: { textDecorationLine: 'line-through' },
});
