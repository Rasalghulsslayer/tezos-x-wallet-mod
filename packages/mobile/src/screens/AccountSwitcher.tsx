/**
 * AccountSwitcher — the account picker bottom sheet (mirrors the design's
 * AccountSwitcherSheet). Driven by ctx.switcherOpen; lists every account with the
 * active one pinned to the top, its runtime badge and address, and a check on the
 * current selection. Tapping a row switches the active account and closes; the
 * footer opens the Add-account flow. A row's trash affordance swaps the sheet for
 * a password-gated removal confirm (the vault re-verifies the password and
 * refuses to drop the last account).
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatError, type FormattedError } from '@tezosx/wallet-core/domain/error';
import { colors, fontSize, font, radius } from '../theme';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Icon } from '../ui/icon';
import { Badge } from '../ui/tx/Badge';
import { Btn } from '../ui/tx/Btn';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { Identicon } from '../ui/tx/Identicon';
import { Sheet } from '../ui/tx/Sheet';
import { useWallet } from '../wallet/context';
import type { ViewAccount } from '../wallet/view-account';

export function AccountSwitcher(): React.JSX.Element {
  const ctx = useWallet();
  const [removeTarget, setRemoveTarget] = useState<ViewAccount | null>(null);
  const sorted = [...ctx.accounts].sort((a, b) =>
    a.id === ctx.activeAccount.id ? -1 : b.id === ctx.activeAccount.id ? 1 : a.createdAt - b.createdAt,
  );

  if (removeTarget != null) {
    return (
      <RemoveAccountSheet
        account={removeTarget}
        isLast={ctx.accounts.length === 1}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          setRemoveTarget(null);
          ctx.closeSwitcher();
        }}
      />
    );
  }

  return (
    <Sheet title="Accounts" onClose={ctx.closeSwitcher}>
      <View style={styles.list}>
        {sorted.map((a) => (
          <SwitcherRow
            key={a.id}
            account={a}
            active={a.id === ctx.activeAccount.id}
            onRemove={() => setRemoveTarget(a)}
          />
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

function SwitcherRow({
  account,
  active,
  onRemove,
}: {
  account: ViewAccount;
  active: boolean;
  onRemove: () => void;
}): React.JSX.Element {
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
          {shortAddr(isEvm ? account.address : account.tz1, 8)}
        </Text>
      </View>
      {active && <Icon name="check" size={20} color={colors.purple} />}
      <Pressable
        hitSlop={8}
        style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
        onPress={onRemove}
      >
        <Icon name="trash" size={16} color={colors.fgSubtle} />
      </Pressable>
    </Pressable>
  );
}

function RemoveAccountSheet({
  account,
  isLast,
  onClose,
  onRemoved,
}: {
  account: ViewAccount;
  isLast: boolean;
  onClose: () => void;
  onRemoved: () => void;
}): React.JSX.Element {
  const ctx = useWallet();
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<FormattedError | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (): void => {
    setPwd('');
    onClose();
  };

  const submit = (): void => {
    if (pwd.length === 0 || busy || isLast) return;
    setErr(null);
    setBusy(true);
    void (async () => {
      try {
        await ctx.removeAccount(account.id, pwd);
        setPwd('');
        onRemoved();
      } catch (e) {
        setErr(formatError(e));
        setBusy(false);
      }
    })();
  };

  return (
    <Sheet title={`Remove ${ctx.labelFor(account)}?`} onClose={close}>
      <View style={styles.removeBody}>
        <View style={styles.warnBanner}>
          <Icon name="alert" size={18} color={colors.danger} />
          <View style={styles.warnBody}>
            <Text style={styles.warnTitle}>This is permanent</Text>
            <Text style={styles.warnDetail}>
              Back up the account&rsquo;s secret before continuing — once removed, it&rsquo;s gone unless you
              re-import it.
            </Text>
          </View>
        </View>

        {isLast ? (
          <View style={styles.lastNote}>
            <ErrorInline
              title="You can't remove your last account"
              detail="Add another account first."
            />
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={pwd}
              autoFocus
              placeholder="Password"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={(t) => {
                setPwd(t);
                setErr(null);
              }}
              onSubmitEditing={submit}
            />
            {err != null && <ErrorInline title={err.title} detail={err.detail} />}
            <Btn variant="danger" full loading={busy} disabled={pwd.length === 0} onPress={submit} style={styles.removeAction}>
              Remove account
            </Btn>
          </>
        )}
      </View>
    </Sheet>
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
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnPressed: { backgroundColor: colors.surface3 },
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

  removeBody: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 16 },
  warnBanner: {
    marginTop: 4,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,93,93,0.18)',
  },
  warnBody: { flex: 1, minWidth: 0 },
  warnTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.danger },
  warnDetail: { fontSize: fontSize.xs, color: colors.fgMuted, lineHeight: 20, marginTop: 3 },
  lastNote: { marginTop: 2 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.md,
    height: 52,
    paddingHorizontal: 16,
  },
  removeAction: { marginTop: 14 },
});
