/**
 * ErrorCard — the post-action failure bandeau (mirrors mobile.css .err-card).
 * Danger-tinted card with an alert icon, a danger title, and a foreground detail
 * line. Used for Send / dApp transaction failures.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../../theme';
import { Icon } from '../icon';

export function ErrorCard({ title, detail }: { title: string; detail: string }): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Icon name="alert" size={18} color={colors.danger} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,93,93,0.22)',
    padding: 15,
    flexDirection: 'row',
    gap: 12,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.danger },
  detail: { fontSize: fontSize.sm, color: colors.fg, lineHeight: 22, marginTop: 4 },
});
