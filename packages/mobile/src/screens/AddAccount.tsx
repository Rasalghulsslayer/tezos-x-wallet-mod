/**
 * AddAccount — the stepped add-account flow (mirrors the design's
 * AddAccountScreen). Three stages tracked by Dots: pick (choose runtime × create
 * or import), input (reveal fresh keys + acknowledge, or paste an existing
 * secret), and confirm (name + a preview of the resulting addresses). Fresh keys
 * gate Continue behind reveal + acknowledgement; imports gate behind a minimum
 * secret length. Submitting adds the mock account and returns Home.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, font, radius } from '../theme';
import { Icon } from '../ui/icon';
import { Badge } from '../ui/tx/Badge';
import { Btn } from '../ui/tx/Btn';
import { Check } from '../ui/tx/Check';
import { Dots } from '../ui/tx/Dots';
import { Identicon } from '../ui/tx/Identicon';
import { Line } from '../ui/tx/Line';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';

type Stage = 'pick' | 'input' | 'confirm';
type Kind = 'tezos' | 'evm';
type Source = 'fresh' | 'import';
interface Pick {
  kind: Kind;
  source: Source;
  title: string;
  sub: string;
  specs: [string, string][];
}

const CARDS: Pick[] = [
  { kind: 'tezos', source: 'fresh', title: 'Tezos account', sub: 'Fresh BIP-39 mnemonic. Get a tz1 + EVM alias.', specs: [['Addresses', 'tz1 + 0x'], ['Key', 'BIP-39']] },
  { kind: 'tezos', source: 'import', title: 'Tezos account', sub: 'Paste a recovery phrase or an edsk private key.', specs: [['Accepts', '12–24 words'], ['Yields', 'tz1 + 0x']] },
  { kind: 'evm', source: 'fresh', title: 'EVM account', sub: 'Fresh 256-bit private key. EVM runtime only.', specs: [['Address', '0x only'], ['Key', '64-char hex']] },
  { kind: 'evm', source: 'import', title: 'EVM account', sub: 'Paste a 0x-prefixed or raw hex private key.', specs: [['Accepts', '0x… hex'], ['Yields', '0x address']] },
];

const FRESH_MNEMONIC = 'ranch puzzle cabin oxygen mimic drama fossil quantum ladder harbor slope violet';
const FRESH_KEY = '0x3c8a1f…9e0b4d3927a5f6180ce2d4b91a7c3e5f0';

export function AddAccount(): React.JSX.Element {
  const ctx = useWallet();
  const [stage, setStage] = useState<Stage>('pick');
  const [pick, setPick] = useState<Pick | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ack, setAck] = useState(false);
  const [importVal, setImportVal] = useState('');
  const [label, setLabel] = useState('');
  const nextSeq = ctx.accounts.length + 1;

  const idx = { pick: 0, input: 1, confirm: 2 }[stage];
  const isCreate = pick != null && pick.source === 'fresh';
  const isTezos = pick != null && pick.kind === 'tezos';
  const title = { pick: 'Add account', input: isCreate ? 'Secure your keys' : 'Import account', confirm: 'Confirm' }[stage];

  const back = (): void => {
    if (stage === 'pick') ctx.nav.back();
    else if (stage === 'input') {
      setStage('pick');
      setRevealed(false);
      setAck(false);
    } else setStage('input');
  };

  const continueOk = isCreate ? revealed && ack : importVal.trim().length >= (isTezos ? 12 : 40);

  const submit = (): void => {
    if (pick == null) return;
    const name = label.trim() !== '' ? label.trim() : `Account ${nextSeq}`;
    ctx.addAccount(pick.kind, name);
    ctx.toast(`${name} added`);
    ctx.nav.reset('home');
  };

  return (
    <View style={styles.screen}>
      <TopBar title={title} onBack={back} right={<View style={styles.dots}><Dots i={idx} n={3} /></View>} />

      {stage === 'pick' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.pickScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.pickIntro}>
            <Text style={styles.kicker}>Step 1 of 3</Text>
            <Text style={styles.pickTitle}>What kind of account?</Text>
            <Text style={styles.pickSub}>
              Pick a runtime and whether you’ll generate fresh keys or import existing ones.
            </Text>
          </View>
          <View style={styles.pickList}>
            {CARDS.map((c, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.pickCard, pressed && styles.pickCardPressed]}
                onPress={() => {
                  setPick(c);
                  setStage('input');
                }}
              >
                <View style={styles.pickHead}>
                  <Badge variant={c.kind === 'evm' ? 'cyan' : 'purple'}>{c.kind === 'evm' ? 'L2' : 'L1'}</Badge>
                  <Text style={styles.pickCardTitle}>{c.title}</Text>
                  <Badge variant="neutral" style={styles.pickSourceBadge}>
                    {c.source === 'fresh' ? 'Create' : 'Import'}
                  </Badge>
                </View>
                <Text style={styles.pickCardSub}>{c.sub}</Text>
                <View style={styles.pickSpecs}>
                  {c.specs.map(([k, v]) => (
                    <View key={k}>
                      <Text style={styles.specK}>{k}</Text>
                      <Text style={styles.specV}>{v}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {stage === 'input' && pick != null && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.inputScroll} showsVerticalScrollIndicator={false}>
            {isCreate ? (
              <>
                <Text style={styles.lead}>
                  {isTezos
                    ? 'Reveal your fresh recovery phrase, write it down, then acknowledge.'
                    : 'Reveal your fresh private key, store it safely, then acknowledge.'}
                </Text>
                <View style={styles.secretWrap}>
                  <View style={styles.secretCard}>
                    <Text style={styles.secretText}>{isTezos ? FRESH_MNEMONIC : FRESH_KEY}</Text>
                  </View>
                  {!revealed && (
                    <Pressable style={styles.seedOverlay} onPress={() => setRevealed(true)}>
                      <Icon name="eye" size={28} color={colors.fg} />
                      <Text style={styles.seedReveal}>Tap to reveal</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.ackWrap}>
                  <Check checked={ack} onToggle={() => setAck((v) => !v)}>
                    I’ve stored it offline and understand it can’t be recovered.
                  </Check>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.lead}>
                  {isTezos
                    ? 'Paste a recovery phrase or edsk private key.'
                    : 'Paste a 0x-prefixed or raw 64-char hex private key.'}
                </Text>
                <TextInput
                  style={styles.importInput}
                  value={importVal}
                  onChangeText={setImportVal}
                  placeholder={isTezos ? 'harbor slope violet … or edsk…' : '0x…'}
                  placeholderTextColor={colors.fgSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.hint}>Your secret never leaves this device.</Text>
              </>
            )}
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn variant="accent" full disabled={!continueOk} onPress={() => setStage('confirm')}>
              Continue
            </Btn>
          </View>
        </>
      )}

      {stage === 'confirm' && pick != null && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.inputScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.confirmHead}>
              <Identicon seed={'new' + pick.kind} size={48} ring={pick.kind === 'evm' ? 'l2' : 'l1'} />
              <View>
                <Text style={styles.confirmTitle}>{pick.kind === 'evm' ? 'EVM account' : 'Tezos account'}</Text>
                <Text style={styles.confirmSub}>
                  {pick.kind === 'evm' ? 'EVM runtime · 0x' : 'Michelson runtime · tz1 + alias'}
                </Text>
              </View>
            </View>
            <Text style={styles.fieldLabel}>Account name (optional)</Text>
            <TextInput
              style={styles.nameInput}
              value={label}
              placeholder={`Account ${nextSeq}`}
              placeholderTextColor={colors.fgSubtle}
              onChangeText={setLabel}
            />
            <View style={styles.previewCard}>
              <Line
                label={pick.kind === 'evm' ? 'Address' : 'tz1'}
                value={<Text style={styles.mono}>{pick.kind === 'evm' ? '0x51F3…4c22' : 'tz1new…8Ri'}</Text>}
              />
              {pick.kind === 'tezos' && (
                <>
                  <View style={styles.divider} />
                  <Line label="EVM alias" value={<Text style={styles.mono}>0xC1a9…F201</Text>} />
                </>
              )}
            </View>
          </ScrollView>
          <View style={styles.actionBar}>
            <Btn variant="accent" full onPress={submit}>
              Add account
            </Btn>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  dots: { paddingRight: 8 },
  scroll: { flex: 1 },

  pickScroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  pickIntro: { paddingHorizontal: 4, paddingTop: 10, paddingBottom: 16 },
  kicker: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.fgSubtle, fontWeight: '600' },
  pickTitle: { fontSize: fontSize['2xl'], fontWeight: '600', letterSpacing: -0.36, color: colors.fg, marginVertical: 6 },
  pickSub: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 20 },
  pickList: { gap: 10 },
  pickCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16 },
  pickCardPressed: { backgroundColor: colors.surface2 },
  pickHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  pickCardTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.fg },
  pickSourceBadge: { marginLeft: 'auto' },
  pickCardSub: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 22 },
  pickSpecs: { flexDirection: 'row', gap: 16, marginTop: 12 },
  specK: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: colors.fgSubtle },
  specV: { fontSize: fontSize.xs, color: colors.fg, fontFamily: font.mono, marginTop: 2 },

  inputScroll: { padding: 22 },
  lead: { fontSize: fontSize.md, color: colors.fgMuted, marginBottom: 16, lineHeight: 22 },
  secretWrap: { position: 'relative' },
  secretCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 16 },
  secretText: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.fg, lineHeight: 23 },
  seedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,11,18,0.82)',
    borderRadius: radius.lg,
  },
  seedReveal: { fontWeight: '600', color: colors.fg, fontSize: fontSize.md },
  ackWrap: { marginTop: 18 },
  importInput: {
    height: 110,
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
  hint: { fontSize: fontSize.xs, color: colors.fgSubtle, marginTop: 8 },

  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg },
  confirmSub: { fontSize: fontSize.sm, color: colors.fgMuted, marginTop: 1 },
  fieldLabel: { fontSize: fontSize.sm, color: colors.fgMuted, marginBottom: 8 },
  nameInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.md,
    height: 52,
    paddingHorizontal: 16,
  },
  previewCard: { marginTop: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.border },
  mono: { fontFamily: font.mono, fontSize: fontSize.md, fontWeight: '500', color: colors.fg },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 42,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    gap: 10,
  },
});
