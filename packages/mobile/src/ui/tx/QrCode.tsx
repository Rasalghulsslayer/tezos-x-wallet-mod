/**
 * QrCode — a real, scannable QR of the deposit address (react-native-qrcode-svg
 * over react-native-svg). Rendered on a white quiet-zone frame for scanner
 * contrast. A wrong render would misdirect funds, so this must be a genuine
 * encoder, not the decorative grid it replaced.
 */

import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius } from '../../theme';

export function QrCode({ value }: { value: string }): React.JSX.Element {
  return (
    <View style={styles.frame}>
      {value !== '' && (
        <QRCode value={value} size={192} color={colors.bg} backgroundColor="#FFFFFF" ecl="M" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
