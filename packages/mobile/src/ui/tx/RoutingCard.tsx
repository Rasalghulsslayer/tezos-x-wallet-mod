/**
 * RoutingCard — the Send routing summary (mirrors mobile.css .routing-card).
 * `routingLabel` maps (source account kind × destination runtime) to the exact
 * routing copy the design ships; a same-runtime path is a flat surface card with
 * an arrow, a cross-runtime path gets the purple→cyan gradient treatment (tinted
 * background + gradient link-icon disc).
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { colors, fontSize, radius } from '../../theme';
import { Icon } from '../icon';

export interface RoutingInfo {
  title: string;
  sub: string;
  cross: boolean;
}

export function routingLabel(sourceKind: 'tezos' | 'evm', dest: 'l1' | 'l2' | null): RoutingInfo {
  if (dest == null) return { title: '—', sub: 'Enter a recipient to see routing', cross: false };
  if (sourceKind === 'tezos') {
    return dest === 'l1'
      ? { title: 'Same-runtime · Tezos L1', sub: 'Native transfer via Taquito', cross: false }
      : { title: 'Cross-runtime', sub: 'L1 → L2 via NAC gateway', cross: true };
  }
  return dest === 'l2'
    ? { title: 'Same-runtime · Tezos L2 (EVM)', sub: 'Native EVM transfer', cross: false }
    : { title: 'Cross-runtime', sub: 'L2 → L1 via NAC precompile', cross: true };
}

export function RoutingCard({
  sourceKind,
  dest,
}: {
  sourceKind: 'tezos' | 'evm';
  dest: 'l1' | 'l2' | null;
}): React.JSX.Element {
  const r = routingLabel(sourceKind, dest);
  return (
    <View style={[styles.card, r.cross && styles.cross]}>
      {r.cross && (
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="rc-bg" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.purple} stopOpacity={0.1} />
              <Stop offset="1" stopColor={colors.cyan} stopOpacity={0.1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#rc-bg)" />
        </Svg>
      )}
      <View style={styles.ico}>
        {r.cross ? (
          <Svg width={32} height={32} viewBox="0 0 32 32" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="rc-ico" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={colors.purple} />
                <Stop offset="1" stopColor={colors.cyan} />
              </LinearGradient>
            </Defs>
            <Circle cx={16} cy={16} r={16} fill="url(#rc-ico)" />
          </Svg>
        ) : null}
        <Icon name={r.cross ? 'link' : 'arrow-right'} size={16} color={r.cross ? '#FFFFFF' : colors.fgMuted} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{r.title}</Text>
        <Text style={styles.sub}>{r.sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  cross: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.22)',
  },
  ico: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  body: { minWidth: 0, flexShrink: 1 },
  title: { fontSize: fontSize.sm, fontWeight: '600', color: colors.fg },
  sub: { fontSize: fontSize.xs, color: colors.fgMuted, marginTop: 2 },
});
