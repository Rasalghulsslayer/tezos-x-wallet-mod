/**
 * Import — bring an existing account onto the device (mirrors the design's
 * ImportScreen). Tezos imports toggle between a BIP-39 mnemonic and a raw edsk
 * secret key via RuntimeToggle; EVM imports take a 0x/64-hex private key. A
 * single secret field plus a vault password + confirm; validation is minimal
 * (mock only) and finishOnboarding hands control back on the fixed acc id.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, font, radius, space } from '../theme';
import { useWallet } from '../wallet/context';
import { Btn } from '../ui/tx/Btn';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { RuntimeToggle } from '../ui/tx/RuntimeToggle';
import { TopBar } from '../ui/tx/TopBar';

export function Import({ params }: { params: Record<string, unknown> }): React.JSX.Element {
  const ctx = useWallet();
  const isEvm = params.kind === 'evm';

  const [mode, setMode] = useState<'mnemonic' | 'edsk'>('mnemonic');
  const [secret, setSecret] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = (): void => {
    setErr(null);
    if (secret.trim().length < 8) {
      return setErr(isEvm ? 'Enter a valid private key' : 'Enter your recovery phrase');
    }
    if (pwd.length < 8) return setErr('Password must be at least 8 characters');
    if (pwd !== confirm) return setErr('Passwords do not match');
    ctx.finishOnboarding(isEvm ? 'acc-3' : 'acc-1');
  };

  const lead = isEvm
    ? 'Paste a 0x-prefixed or raw 64-char hex private key.'
    : mode === 'mnemonic'
      ? 'Paste your 12/15/18/21/24-word BIP39 mnemonic. Words are separated by spaces.'
      : 'Paste a Tezos secret key (edsk…). This imports a single standalone account.';

  const placeholder = isEvm ? '0x…' : mode === 'mnemonic' ? 'harbor slope violet …' : 'edsk…';
  const tall = !isEvm && mode === 'mnemonic';

  return (
    <View style={styles.screen}>
      <TopBar title={isEvm ? 'Import EVM wallet' : 'Import Tezos wallet'} onBack={() => ctx.nav.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>{lead}</Text>

        {!isEvm && (
          <View style={styles.toggle}>
            <RuntimeToggle
              full
              value={mode === 'mnemonic' ? 'l1' : 'l2'}
              onChange={(v) => {
                setMode(v === 'l1' ? 'mnemonic' : 'edsk');
                setSecret('');
              }}
              l1Label="Recovery phrase"
              l2Label="Private key"
            />
          </View>
        )}

        <TextInput
          style={[styles.inputMono, { height: tall ? 130 : 88 }]}
          value={secret}
          onChangeText={setSecret}
          placeholder={placeholder}
          placeholderTextColor={colors.fgSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.hint}>Your secret never leaves this device.</Text>

        <View style={styles.fields}>
          <View>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={pwd}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={setPwd}
            />
          </View>
          <View>
            <Text style={styles.fieldLabel}>Confirm password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirm}
              placeholder="Re-enter password"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={setConfirm}
            />
          </View>
          {err != null && <ErrorInline title={err} />}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <Btn variant="accent" full onPress={submit}>
          Import wallet
        </Btn>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 22 },
  lead: { fontSize: fontSize.md, color: colors.fgMuted, marginBottom: space[4], lineHeight: 22 },
  toggle: { marginBottom: space[4] },
  hint: { fontSize: fontSize.xs, color: colors.fgSubtle, marginTop: space[2] },
  fields: { gap: space[4] - 2, marginTop: space[5] },
  fieldLabel: { fontSize: fontSize.sm, color: colors.fgMuted, marginBottom: space[2] },
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
  inputMono: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    lineHeight: 22,
  },
  actionBar: {
    padding: space[4],
    paddingBottom: space[4] + 30,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    gap: space[3] - 2,
  },
});
