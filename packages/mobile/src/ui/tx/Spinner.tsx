/**
 * Spinner — the pending "sending" ring. An animated bordered arc that
 * approximates the design's conic-gradient spinner (conic-gradient and
 * mask-composite are web-only). Shared by the Send done-state and the Approve
 * signing-state so the animation is defined once.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export function Spinner({ accent = 'purple' }: { accent?: 'purple' | 'cyan' }): React.JSX.Element {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const color = accent === 'cyan' ? colors.cyan : colors.purple;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={[styles.spinner, { borderTopColor: color, borderRightColor: color, transform: [{ rotate }] }]}
    />
  );
}

const styles = StyleSheet.create({
  spinner: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: colors.surface3 },
});
