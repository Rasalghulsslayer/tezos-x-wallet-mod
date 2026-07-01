/**
 * RiskBand — the approval risk indicator (mirrors mobile.css .risk). Shield icon,
 * title + detail, and a 3-bar meter. Level colours the whole band: low = success
 * (1 bar), med = warning (2 bars), high = danger (3 bars).
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../../theme';
import { Icon } from '../icon';

export type RiskLevel = 'low' | 'med' | 'high';

export function RiskBand({
  level = 'low',
  title,
  detail,
}: {
  level?: RiskLevel;
  title: string;
  detail: string;
}): React.JSX.Element {
  const accent = level === 'high' ? colors.danger : level === 'med' ? colors.warning : colors.success;
  const bg = level === 'high' ? colors.dangerBg : level === 'med' ? colors.warningBg : colors.successBg;
  const bars = level === 'low' ? 1 : level === 'med' ? 2 : 3;

  return (
    <View style={[styles.band, { backgroundColor: bg }]}>
      <Icon name="shield" size={18} color={accent} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: accent }]}>{title}</Text>
        <Text style={[styles.detail, { color: accent }]}>{detail}</Text>
      </View>
      <View style={styles.bars}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.bar, { backgroundColor: accent, opacity: i < bars ? 1 : 0.25 }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
  },
  body: { flex: 1 },
  title: { fontSize: fontSize.sm, fontWeight: '600' },
  detail: { fontSize: fontSize.xs, opacity: 0.92, marginTop: 2, lineHeight: 17 },
  bars: { flexDirection: 'row', gap: 3 },
  bar: { width: 5, height: 12, borderRadius: 1 },
});
