/**
 * Badge — the mobile design's pill label (mirrors mobile.css .badge). The
 * purple/cyan variants carry a hairline outline; the others are flat tinted
 * fills. `style`/`textStyle` let callers nudge the size (the asset row uses a
 * shorter 18px badge, and the account header renders L1/L2 chips).
 */

import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

export type BadgeVariant = 'neutral' | 'purple' | 'cyan' | 'success' | 'danger' | 'warning' | 'testnet';

export function Badge({
  variant = 'neutral',
  children,
  style,
  textStyle,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
}): React.JSX.Element {
  return (
    <View style={[styles.badge, FILL[variant], style]}>
      <Text style={[styles.text, { color: TEXT[variant] }, textStyle]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 22,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  text: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
});

const FILL: Record<BadgeVariant, ViewStyle> = {
  neutral: { backgroundColor: colors.surface2 },
  purple: { backgroundColor: colors.purpleBg, borderColor: colors.purpleLine },
  cyan: { backgroundColor: colors.cyanBg, borderColor: colors.cyanLine },
  success: { backgroundColor: colors.successBg },
  danger: { backgroundColor: colors.dangerBg },
  warning: { backgroundColor: colors.warningBg },
  testnet: { backgroundColor: colors.warningBg, borderColor: 'rgba(255,184,76,0.35)' },
};

const TEXT: Record<BadgeVariant, string> = {
  neutral: colors.fgMuted,
  purple: colors.purpleText,
  cyan: colors.cyanText,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  testnet: colors.warning,
};
