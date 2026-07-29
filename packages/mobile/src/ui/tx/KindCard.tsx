/**
 * KindCard — the selectable account-kind card used in onboarding (mirrors
 * mobile.css .kind-card). Title + mono detail; when selected it borders and
 * tints with its runtime accent (purple for Michelson/Tezos, cyan for EVM).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, font, radius } from '../../theme';

export function KindCard({
  title,
  detail,
  accent,
  selected,
  onPress,
  children,
}: {
  title: string;
  detail: string;
  accent: 'purple' | 'cyan';
  selected?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  const selStyle =
    selected && accent === 'purple'
      ? styles.selPurple
      : selected && accent === 'cyan'
        ? styles.selCyan
        : null;
  return (
    <Pressable style={[styles.card, selStyle]} onPress={onPress}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {children != null && <View>{children}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  selPurple: { borderColor: colors.purpleLine, backgroundColor: colors.purpleBg },
  selCyan: { borderColor: colors.cyanLine, backgroundColor: colors.cyanBg },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg },
  detail: { fontSize: fontSize.sm, color: colors.fgMuted, fontFamily: font.mono },
});
