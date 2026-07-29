/**
 * Dots — onboarding progress indicator (mirrors mobile.css .dots). The active
 * dot elongates into a rounded bar; the rest stay round and dim.
 */

import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme';

export function Dots({ i, n }: { i: number; n: number }): React.JSX.Element {
  return (
    <View style={styles.row}>
      {Array.from({ length: n }).map((_, k) => (
        <View key={k} style={[styles.dot, k === i && styles.on]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.surface3 },
  on: { backgroundColor: colors.fg, width: 20, borderRadius: 4 },
});
