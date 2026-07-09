/**
 * ChainPill — the runtime chip (mirrors mobile.css .chain-pill). A glowing dot
 * (purple for Michelson, cyan for EVM) next to the runtime label.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../../theme';

export function ChainPill({ chain }: { chain: 'l1' | 'l2' }): React.JSX.Element {
  const isL1 = chain === 'l1';
  const accent = isL1 ? colors.purple : colors.cyan;
  return (
    <View style={styles.pill}>
      <View
        style={[
          styles.dot,
          { backgroundColor: accent, shadowColor: accent },
        ]}
      />
      <Text style={styles.label}>{isL1 ? 'Michelson' : 'EVM'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingLeft: 8,
    paddingRight: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  label: { fontSize: fontSize.xs, color: colors.fg },
});
