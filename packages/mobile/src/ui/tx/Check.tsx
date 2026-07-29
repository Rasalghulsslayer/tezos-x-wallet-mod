/**
 * Check — a checkbox line for onboarding acknowledgements (mirrors mobile.css
 * .checkline + .checkbox). The whole row is tappable; the box fills purple with
 * a check when on. Label content is passed as children (usually a Text).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../../theme';
import { Icon } from '../icon';

export function Check({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable style={styles.line} onPress={() => onToggle(!checked)}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
      </View>
      {typeof children === 'string' ? <Text style={styles.label}>{children}</Text> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  label: { flex: 1, fontSize: fontSize.sm, color: colors.fg, lineHeight: 20 },
});
