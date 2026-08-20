/**
 * AddrRow — one address line inside the account header (mirrors mobile.css
 * .ah-addr). A runtime badge (Michelson / EVM), the middle-truncated mono
 * address, and a copy affordance. A null address means the EVM alias is still
 * resolving (first unlock, or offline): the row shows a muted placeholder and
 * the copy affordance is disabled — there is nothing truthful to copy yet.
 * Pure: the copy handler is injected by the header/screen.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, fontSize, radius } from '../../theme';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Icon } from '../icon';
import { Badge } from './Badge';

export function AddrRow({
  chain,
  addr,
  copyAddr,
}: {
  chain: 'l1' | 'l2';
  addr: string | null;
  copyAddr?: (addr: string) => void;
}): React.JSX.Element {
  const resolving = addr == null;
  return (
    <View style={styles.row}>
      <Badge variant={chain === 'l1' ? 'purple' : 'cyan'}>{chain === 'l1' ? 'Michelson' : 'EVM'}</Badge>
      <Text style={[styles.addr, resolving && styles.resolving]} numberOfLines={1}>
        {resolving ? 'Resolving EVM address…' : shortAddr(addr, 10)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy address"
        accessibilityState={{ disabled: resolving }}
        disabled={resolving}
        hitSlop={8}
        onPress={() => { if (addr != null) copyAddr?.(addr); }}
        style={[styles.copy, resolving && styles.copyDisabled]}
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
  resolving: { color: colors.fgMuted, fontStyle: 'italic' },
  copy: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  copyDisabled: { opacity: 0.35 },
});
