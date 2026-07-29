/**
 * PinnedChip — the fixed account context row on the Approve sheets (mirrors
 * mobile.css .pinned-chip). A leading node (identicon/mark), the account label,
 * and its mono address. Non-interactive: it shows which account the dApp request
 * is bound to.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, font, radius } from '../../theme';

export function PinnedChip({
  label,
  addr,
  leading,
}: {
  label: string;
  addr: string;
  leading?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.chip}>
      {leading}
      <View style={styles.body}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.addr} numberOfLines={1}>
          {addr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: fontSize.sm, fontWeight: '500', color: colors.fg },
  addr: { fontSize: fontSize.xs, color: colors.fgMuted, fontFamily: font.mono, marginTop: 1 },
});
