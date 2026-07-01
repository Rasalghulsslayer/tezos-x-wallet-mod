/**
 * LinkRow — a tappable settings/menu row (mirrors mobile.css .link-row). Leading
 * icon tile, title + optional subtitle, and a trailing chevron (or a custom
 * trailing node, e.g. a badge or switch).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../../theme';
import { Icon, type IconName } from '../icon';

export function LinkRow({
  icon,
  title,
  sub,
  onPress,
  trailing,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.ico}>
        <Icon name={icon} size={18} color={colors.fgMuted} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {sub != null && <Text style={styles.sub}>{sub}</Text>}
      </View>
      {trailing ?? (
        <View style={styles.chev}>
          <Icon name="chevron-right" size={18} color={colors.fgSubtle} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: space[5],
  },
  pressed: { backgroundColor: colors.surface2 },
  ico: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  sub: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 1 },
  chev: {},
});
