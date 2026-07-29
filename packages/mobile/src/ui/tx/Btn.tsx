/**
 * Btn — the mobile design's button (mirrors mobile.css .btn). Variants map to
 * the accent system: primary (inverted fill), accent (purple), accent-cyan,
 * outline, ghost, danger. Sizes sm/xs shrink height + radius; `full` stretches.
 * String children are wrapped in the button's Text style; node children (e.g. an
 * Icon + label) are laid out in the row and inherit nothing — pass styled Text.
 */

import { Children, isValidElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fontSize, radius, space } from '../../theme';

export type BtnVariant = 'primary' | 'accent' | 'accent-cyan' | 'outline' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'xs';

export function Btn({
  variant = 'primary',
  size,
  full,
  disabled,
  loading,
  onPress,
  children,
  style,
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  full?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}): React.JSX.Element {
  const sizeBase = size === 'xs' ? styles.xs : size === 'sm' ? styles.sm : styles.base;
  const variantStyle = VARIANT[variant];
  const isBusy = loading === true;
  const isDisabled = disabled === true || isBusy;
  const textStyle = [
    styles.label,
    size === 'xs' ? styles.labelXs : size === 'sm' ? styles.labelSm : styles.labelBase,
    TEXT_VARIANT[variant],
  ];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.container,
        sizeBase,
        variantStyle,
        full && styles.full,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {isBusy ? (
        <ActivityIndicator size="small" color={TEXT_VARIANT[variant].color} />
      ) : (
        Children.map(children, (child) =>
          typeof child === 'string' || typeof child === 'number' ? (
            <Text style={textStyle}>{child}</Text>
          ) : isValidElement(child) ? (
            child
          ) : null,
        )
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    borderWidth: 1,
    borderColor: 'transparent',
  },
  base: { height: 52, paddingHorizontal: 22, borderRadius: radius.md },
  sm: { height: 38, paddingHorizontal: 14, borderRadius: radius.sm },
  xs: { height: 32, paddingHorizontal: 12, borderRadius: radius.sm },
  full: { alignSelf: 'stretch', flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.9 },
  label: { fontWeight: '600', letterSpacing: -0.05 },
  labelBase: { fontSize: fontSize.md },
  labelSm: { fontSize: fontSize.sm },
  labelXs: { fontSize: fontSize.xs },
});

const VARIANT: Record<BtnVariant, ViewStyle> = {
  primary: { backgroundColor: colors.fg },
  accent: {
    backgroundColor: colors.purple,
    borderColor: 'rgba(124,92,255,0.6)',
    shadowColor: colors.purple,
    shadowOpacity: 0.5,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  'accent-cyan': {
    backgroundColor: colors.cyan,
    borderColor: 'rgba(0,194,255,0.55)',
    shadowColor: colors.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  outline: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'transparent', borderColor: 'rgba(255,93,93,0.35)' },
};

const TEXT_VARIANT: Record<BtnVariant, { color: string }> = {
  primary: { color: colors.fgInverted },
  accent: { color: '#FFFFFF' },
  'accent-cyan': { color: '#04121A' },
  outline: { color: colors.fg },
  ghost: { color: colors.fgMuted },
  danger: { color: colors.danger },
};
