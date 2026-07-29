/**
 * AssetRow — a balance line on Home (mirrors mobile.css .asset-row). The asset
 * mark, the symbol with a Native/ERC-20 badge + runtime caption, and the
 * right-aligned balance (masked to bullets when balances are hidden).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, space } from '../../theme';
import { AssetMark } from './AssetMark';
import { Badge } from './Badge';

export interface AssetRowAsset {
  symbol: string;
  kind: 'xtz' | 'token';
}

export function AssetRow({
  asset,
  balance,
  hidden,
  onPress,
}: {
  asset: AssetRowAsset;
  balance: string;
  hidden?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const isXtz = asset.kind === 'xtz';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <AssetMark symbol={asset.symbol} kind={asset.kind} />
      <View style={styles.body}>
        <Text style={styles.name}>{asset.symbol}</Text>
        <View style={styles.sub}>
          <Badge
            variant={isXtz ? 'purple' : 'cyan'}
            style={styles.subBadge}
            textStyle={styles.subBadgeText}
          >
            {isXtz ? 'Native' : 'ERC-20'}
          </Badge>
          <Text style={styles.subText}>{isXtz ? 'Michelson runtime' : 'EVM runtime'}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.bal}>{hidden ? '••••' : balance}</Text>
        <Text style={styles.usd}>{asset.symbol}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: space[5],
  },
  pressed: { backgroundColor: colors.surface2 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  subBadge: { height: 18, paddingHorizontal: 7 },
  subBadgeText: { fontSize: 9.5 },
  subText: { fontSize: fontSize.sm, color: colors.fgMuted },
  right: { alignItems: 'flex-end' },
  bal: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg, fontVariant: ['tabular-nums'] },
  usd: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 1, fontVariant: ['tabular-nums'] },
});
