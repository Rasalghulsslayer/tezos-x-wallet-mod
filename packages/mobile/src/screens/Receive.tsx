/**
 * Receive — shows the address to fund the active account. A Tezos account can
 * toggle between its L1 tz1 and its L2 alias (RuntimeToggle); an EVM account has
 * a single 0x. The QR encodes the selected address, with a full-address readout,
 * a copy action, and a runtime-specific note about what can be sent here.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, fontSize } from '../theme';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { QrCode } from '../ui/tx/QrCode';
import { RuntimeToggle } from '../ui/tx/RuntimeToggle';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';

export function Receive(_props: { params?: Record<string, unknown> } = {}): React.JSX.Element {
  const ctx = useWallet();
  const acc = ctx.activeAccount;
  const isEvm = acc.kind === 'evm';
  const [runtime, setRuntime] = useState<'l1' | 'l2'>('l1');
  // null only on the l2 face of a tz1 account while its kernel alias is still
  // resolving: nothing truthful can be shown or copied yet, so the QR and copy
  // are withheld rather than encoding an empty/false deposit address.
  const addr: string | null = (isEvm ? acc.address : runtime === 'l1' ? acc.tz1 : acc.evmAlias) ?? null;
  const resolving = addr == null;

  return (
    <View style={styles.screen}>
      <TopBar title="Receive" onBack={() => ctx.nav.back()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isEvm && (
          <View style={styles.toggle}>
            <RuntimeToggle value={runtime} onChange={setRuntime} />
          </View>
        )}

        <QrCode value={addr ?? ''} />

        <View style={styles.addrBlock}>
          <Text style={styles.kicker}>
            {isEvm ? 'EVM address' : runtime === 'l1' ? 'tz1 address' : '0x address'}
          </Text>
          {resolving
            ? <Text style={styles.resolving}>Resolving EVM address…</Text>
            : <Text style={styles.addr}>{addr}</Text>}
        </View>

        <View style={styles.actions}>
          <Btn variant="outline" full disabled={resolving} onPress={() => { if (addr != null) ctx.copy(addr); }}>
            <Icon name="copy" size={15} color={colors.fg} />
            <Text style={styles.copyLabel}>Copy</Text>
          </Btn>
        </View>

        <Text style={styles.note}>
          {isEvm
            ? 'Native XTZ and ERC-20 tokens on the EVM runtime can be sent here.'
            : `Only send ${runtime === 'l1' ? 'Tezos-native assets' : 'EVM-side assets'} to this address.\nCross-runtime transfers go through the Send flow.`}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
  scroll: { flex: 1, minHeight: 0 },
  content: { padding: 22, alignItems: 'center' },
  toggle: { marginBottom: 20 },
  addrBlock: { marginTop: 20, alignItems: 'center', width: '100%' },
  kicker: {
    fontSize: 11,
    letterSpacing: 0.99,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
    marginBottom: 8,
  },
  addr: {
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    color: colors.fg,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
    letterSpacing: -0.1,
  },
  resolving: {
    fontSize: fontSize.sm,
    color: colors.fgMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  copyLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.fg },
  note: {
    fontSize: fontSize.xs,
    color: colors.fgSubtle,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 19,
  },
});
