/**
 * Line — a label/value row (mirrors mobile.css .line). Muted label on the left,
 * tabular-aligned value on the right. Used in review lanes and detail lists.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, space } from '../../theme';

export function Line({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.line}>
      {typeof label === 'string' ? <Text style={styles.l}>{label}</Text> : label}
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={styles.v}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingVertical: 15,
    paddingHorizontal: space[4],
  },
  l: { fontSize: fontSize.md, color: colors.fgMuted },
  v: {
    fontSize: fontSize.md,
    fontWeight: '500',
    textAlign: 'right',
    color: colors.fg,
    fontVariant: ['tabular-nums'],
  },
});
