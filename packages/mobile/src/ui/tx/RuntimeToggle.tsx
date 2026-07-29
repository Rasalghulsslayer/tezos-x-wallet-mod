/**
 * RuntimeToggle — the Michelson/EVM segmented switch (mirrors mobile.css
 * .runtime-toggle). Pill track with two options; the selected L1 lights purple
 * (white text), the selected L2 lights cyan (dark text). `full` stretches both
 * segments to equal width across the container.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../../theme';

export function RuntimeToggle({
  value,
  onChange,
  l1Label = 'Michelson runtime',
  l2Label = 'EVM runtime',
  full,
}: {
  value: 'l1' | 'l2';
  onChange: (v: 'l1' | 'l2') => void;
  l1Label?: string;
  l2Label?: string;
  full?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.track, full && styles.trackFull]}>
      <Segment
        label={l1Label}
        on={value === 'l1'}
        onPress={() => onChange('l1')}
        onStyle={styles.onL1}
        onTextColor="#FFFFFF"
        full={full}
      />
      <Segment
        label={l2Label}
        on={value === 'l2'}
        onPress={() => onChange('l2')}
        onStyle={styles.onL2}
        onTextColor="#04121A"
        full={full}
      />
    </View>
  );
}

function Segment({
  label,
  on,
  onPress,
  onStyle,
  onTextColor,
  full,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  onStyle: object;
  onTextColor: string;
  full?: boolean;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.seg, full && styles.segFull, on && onStyle]}>
      <Text style={[styles.segText, on && { color: onTextColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    padding: 4,
    gap: 3,
  },
  trackFull: { alignSelf: 'stretch' },
  seg: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segFull: { flex: 1 },
  segText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color: colors.fgMuted,
  },
  onL1: { backgroundColor: colors.purple },
  onL2: { backgroundColor: colors.cyan },
});
