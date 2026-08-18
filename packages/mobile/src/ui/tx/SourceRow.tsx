/**
 * SourceRow — a tappable list row for the add-account choose screen: one row
 * per way of adding an account (import existing keys, start from new keys).
 * Title over a muted sub-line with a trailing chevron; `disabled` dims the row
 * and swallows the press (used when the account cap is reached).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../../theme';
import { Icon } from '../icon';

export function SourceRow({
  title,
  sub,
  onPress,
  disabled,
}: {
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && disabled !== true && styles.pressed,
        disabled === true && styles.disabled,
      ]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.fgSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.45 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.fg },
  sub: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 19 },
});
