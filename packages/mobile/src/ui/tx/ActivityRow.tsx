/**
 * ActivityRow — one transaction line in the activity list (mirrors mobile.css
 * .activity + .act-ident). The left identicon is a runtime-coloured ring around
 * a direction arrow: purple (L1), cyan (L2), a purple→cyan sweep (cross), an
 * amber spinner (pending), or a solid danger ring (failed). The middle column
 * carries verb → peer and a runtime tag + relative time (or Pending/Failed); the
 * right column is the signed amount, greyed & struck for failures.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { colors, font, fontSize, space } from '../../theme';
import type { ActivityRowVM } from '../../wallet/activity-vm';
import { timeAgo } from '../format';
import { Icon } from '../icon';

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
  const arrow = item.dir === 'in' ? 'arrow-down-left' : 'arrow-up-right';

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
      <ActIdent ident={ident} arrow={arrow} />
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
  arrow,
}: {
  ident: Ident;
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

  return (
    <View style={styles.ident}>
      {ring}
      <View style={styles.core}>
        <Icon name={arrow} size={16} color={coreColor} />
      </View>
    </View>
  );
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
