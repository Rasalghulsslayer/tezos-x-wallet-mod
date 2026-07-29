/**
 * LogoMark — the Tezos X brand mark. Renders the same asset the Chrome extension
 * ships in its toolbar (icons/icon128.png, copied here as tezos-x-mark.png), so
 * the mobile brand and the extension stay in sync.
 */

import { Image, StyleSheet } from 'react-native';
import { radius } from '../../theme';
import brandMark from '../../assets/logos/tezos-x-mark.png';

export function LogoMark({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <Image
      source={brandMark}
      style={[styles.mark, { width: size, height: size, borderRadius: size < 40 ? radius.sm : radius.md }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  mark: {},
});
