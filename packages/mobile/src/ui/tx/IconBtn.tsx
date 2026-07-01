/**
 * IconBtn — a 40×40 tappable icon target (mirrors mobile.css .iconbtn). Used for
 * top-bar actions and sheet close buttons; muted at rest, surface tint + full
 * foreground on press.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';
import { Icon, type IconName } from '../icon';

export function IconBtn({
  name,
  onPress,
  label,
  size = 20,
}: {
  name: IconName;
  onPress?: () => void;
  label?: string;
  size?: number;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      {({ pressed }) => (
        <View>
          <Icon name={name} size={size} color={pressed ? colors.fg : colors.fgMuted} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors.surface2 },
});
