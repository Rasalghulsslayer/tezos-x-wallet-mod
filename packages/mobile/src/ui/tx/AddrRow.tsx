/**
 * AddrRow — one address line inside the account header (mirrors mobile.css
 * .ah-addr). An L1/L2 badge, the middle-truncated mono address, and a copy
 * affordance. Pure: the copy handler is injected by the header/screen.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, fontSize, radius } from '../../theme';
import { truncAddr } from '../format';
import { Icon } from '../icon';
import { Badge } from './Badge';

export function AddrRow({
  chain,
  addr,
  copyAddr,
}: {
  chain: 'l1' | 'l2';
  addr: string;
  copyAddr?: (addr: string) => void;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Badge variant={chain === 'l1' ? 'purple' : 'cyan'}>{chain === 'l1' ? 'L1' : 'L2'}</Badge>
      <Text style={styles.addr} numberOfLines={1}>
        {truncAddr(addr, 10)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy address"
        hitSlop={8}
        onPress={() => copyAddr?.(addr)}
        style={styles.copy}
      >
        <Icon name="copy" size={15} color={colors.fgSubtle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addr: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    letterSpacing: -0.13,
    color: colors.fg,
  },
  copy: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
