/**
 * AccountSwitcher — the account picker bottom sheet (mirrors the design's
 * AccountSwitcherSheet). Driven by ctx.switcherOpen; lists every account with the
 * active one pinned to the top, its runtime badge and address, and a check on the
 * current selection. Tapping a row switches the active account and closes; the
 * footer opens the Add-account flow.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, font, radius } from '../theme';
import { truncAddr } from '../ui/format';
import { Icon } from '../ui/icon';
import { Badge } from '../ui/tx/Badge';
import { Identicon } from '../ui/tx/Identicon';
import { Sheet } from '../ui/tx/Sheet';
import { useWallet } from '../wallet/context';
import type { ViewAccount } from '../wallet/view-account';

export function AccountSwitcher(): React.JSX.Element {
  const ctx = useWallet();
  const sorted = [...ctx.accounts].sort((a, b) =>
    a.id === ctx.activeAccount.id ? -1 : b.id === ctx.activeAccount.id ? 1 : a.createdAt - b.createdAt,
  );

  return (
    <Sheet title="Accounts" onClose={ctx.closeSwitcher}>
      <View style={styles.list}>
        {sorted.map((a) => (
          <SwitcherRow key={a.id} account={a} active={a.id === ctx.activeAccount.id} />
        ))}
        <Pressable
          style={({ pressed }) => [styles.foot, pressed && styles.footPressed]}
          onPress={() => {
            ctx.closeSwitcher();
            ctx.nav.push('addAccount');
          }}
        >
          <Icon name="plus" size={16} color={colors.fg} />
          <Text style={styles.footText}>Add account</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function SwitcherRow({ account, active }: { account: ViewAccount; active: boolean }): React.JSX.Element {
  const ctx = useWallet();
  const isEvm = account.kind === 'evm';

  return (
    <Pressable
      style={({ pressed }) => [styles.row, (active || pressed) && styles.rowActive]}
      onPress={() => {
        ctx.setActive(account.id);
        ctx.closeSwitcher();
      }}
    >
      <Identicon seed={account.identitySeed} size={40} ring={isEvm ? 'l2' : 'l1'} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {ctx.labelFor(account)}
          </Text>
          <Badge variant={isEvm ? 'cyan' : 'purple'} style={styles.badge} textStyle={styles.badgeText}>
            {isEvm ? 'EVM' : 'Tezos'}
          </Badge>
        </View>
        <Text style={styles.addr} numberOfLines={1}>
          {truncAddr(isEvm ? account.address : account.tz1, 8)}
        </Text>
      </View>
      {active && <Icon name="check" size={20} color={colors.purple} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.md },
  rowActive: { backgroundColor: colors.surface2 },
  body: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg, flexShrink: 1 },
  badge: { height: 18, paddingHorizontal: 7 },
  badgeText: { fontSize: 9.5 },
  addr: { fontSize: fontSize.sm, color: colors.fgMuted, fontFamily: font.mono, marginTop: 2 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footPressed: { backgroundColor: colors.surface2 },
  footText: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
});
