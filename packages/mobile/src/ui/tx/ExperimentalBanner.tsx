/**
 * ExperimentalBanner — the non-dismissible previewnet warning strip that sits at
 * the top of every surface (mirrors mobile.css .exp-banner). Ships until a real
 * mainnet release.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { Icon } from '../icon';

export function ExperimentalBanner(): React.JSX.Element {
  return (
    <View style={styles.banner}>
      <Icon name="alert" size={13} strokeWidth={1.8} color={colors.warning} />
      <Text style={styles.text}>Experimental software · Previewnet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.warningBg,
  },
  text: {
    color: colors.warning,
    fontSize: 11.5,
    letterSpacing: 0.46,
    fontWeight: '500',
  },
});
