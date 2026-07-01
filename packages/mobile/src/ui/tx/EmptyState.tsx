/**
 * EmptyState — the centered "nothing here yet" panel (mirrors mobile.css .empty).
 * An icon tile, a title, a wrapped detail line, and an optional outline action
 * button. `icon` is a node so callers pass an <Icon /> at the size they want.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../../theme';
import { Btn } from './Btn';

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
}): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.ico}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {action != null && (
        <Btn variant="outline" size="sm" onPress={action.onPress} style={styles.action}>
          {action.label}
        </Btn>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 40,
    gap: 14,
  },
  ico: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg },
  detail: {
    fontSize: fontSize.sm,
    color: colors.fgMuted,
    lineHeight: 20,
    maxWidth: 260,
    textAlign: 'center',
  },
  action: { marginTop: 4 },
});
