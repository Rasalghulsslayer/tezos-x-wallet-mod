/**
 * Burst — the success flourish shown when an action finalizes: a spring-scaled
 * check on a soft success disc. Shared by the Send done-state and the Approve
 * done-state.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { Icon } from '../icon';

export function Burst(): React.JSX.Element {
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }).start();
  }, [scale]);
  return (
    <Animated.View style={[styles.burst, { transform: [{ scale }] }]}>
      <Icon name="check" size={34} color={colors.success} strokeWidth={2.4} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  burst: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
