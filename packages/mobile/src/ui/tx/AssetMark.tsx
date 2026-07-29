/**
 * AssetMark — round token glyph (mirrors mobile.css .asset-mark). XTZ renders the
 * real Tezos mark (TezosGlyph) on the purple accent disc; USDC its brand logo
 * image; anything else a muted generic disc with the symbol's first three
 * letters. The logos are the same assets the extension ships (packages/wallet/
 * icons), copied into src/assets/logos. `size='sm'` renders the compact 34px
 * variant.
 */

import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { TezosGlyph } from './TezosGlyph';
import usdcLogo from '../../assets/logos/circle-usdc.png';

export function AssetMark({
  symbol,
  kind = 'xtz',
  size,
}: {
  symbol?: string;
  kind?: 'xtz' | 'token';
  size?: 'sm';
}): React.JSX.Element {
  const dim = size === 'sm' ? 34 : 44;
  const rounded = dim / 2;

  if (kind === 'xtz') {
    return (
      <View style={[styles.mark, { width: dim, height: dim, borderRadius: rounded }]}>
        <Svg width={dim} height={dim} viewBox="0 0 44 44" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="am-xtz" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={colors.purple} />
              <Stop offset="1" stopColor="#4A2FB3" />
            </LinearGradient>
          </Defs>
          <Circle cx={22} cy={22} r={22} fill="url(#am-xtz)" />
        </Svg>
        <TezosGlyph size={dim * 0.5} color="#FFFFFF" />
      </View>
    );
  }

  // Known ERC-20 logo (USDC ships a full circular mark — render it directly).
  if (symbol === 'USDC') {
    return <Image source={usdcLogo} style={{ width: dim, height: dim, borderRadius: rounded }} resizeMode="contain" />;
  }

  const label = (symbol ?? '?').slice(0, 3);
  return (
    <View style={[styles.mark, styles.generic, { width: dim, height: dim, borderRadius: rounded }]}>
      <Text style={[styles.label, { fontSize: size === 'sm' ? 12 : 15 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  generic: { backgroundColor: colors.surface3 },
  label: { fontWeight: '700', color: colors.fgMuted },
});
