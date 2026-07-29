/**
 * ErrorInline — the compact form-field error (mirrors mobile.css .err-inline).
 * A small alert icon with a danger title and an optional muted detail; sits
 * directly under the offending input (wrong password, invalid mnemonic, …).
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../../theme';
import { Icon } from '../icon';

export function ErrorInline({ title, detail }: { title: string; detail?: string }): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.ico}>
        <Icon name="alert" size={14} color={colors.danger} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {detail != null && <Text style={styles.detail}>{detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  ico: { paddingTop: 1 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.sm, fontWeight: '500', color: colors.danger },
  detail: { fontSize: fontSize.xs, color: colors.fgMuted, marginTop: 1, lineHeight: 17 },
});
