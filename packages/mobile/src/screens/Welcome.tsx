/**
 * Welcome — the first-run runtime picker (mirrors the design's WelcomeScreen).
 * A hero orb + brand mark over the "One wallet. Two runtimes." pitch, then two
 * KindCards (Michelson/tz1 vs EVM/0x). The chosen kind is threaded into the
 * create/import flow via ctx.nav.push(name, { kind }); the ghost CTA label
 * follows the kind (recovery phrase for Tezos, private key for EVM).
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { RadialGradient, Stop, Defs, Circle } from 'react-native-svg';
import { colors, fontSize, space } from '../theme';
import { useWallet } from '../wallet/context';
import { Btn } from '../ui/tx/Btn';
import { KindCard } from '../ui/tx/KindCard';
import { LogoMark } from '../ui/tx/LogoMark';

export function Welcome(): React.JSX.Element {
  const ctx = useWallet();
  const [kind, setKind] = useState<'tezos' | 'evm'>('tezos');

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <WelcomeOrb />
          <View style={styles.pitch}>
            <Text style={styles.h1}>One wallet.{'\n'}Two runtimes.</Text>
            <Text style={styles.sub}>
              Pick the runtime your account belongs to. You can add the other one in a future release.
            </Text>
          </View>
          <View style={styles.cards}>
            <View style={styles.cardCol}>
              <KindCard
                accent="purple"
                title="Michelson"
                detail="tz1 · BIP-39"
                selected={kind === 'tezos'}
                onPress={() => setKind('tezos')}
              />
            </View>
            <View style={styles.cardCol}>
              <KindCard
                accent="cyan"
                title="EVM runtime"
                detail="0x · secp256k1"
                selected={kind === 'evm'}
                onPress={() => setKind('evm')}
              />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Btn variant="accent" full onPress={() => ctx.nav.push('create', { kind })}>
            Create a new wallet
          </Btn>
          <Btn variant="ghost" full onPress={() => ctx.nav.push('import', { kind })}>
            {kind === 'tezos' ? 'I have a recovery phrase' : 'I have a private key'}
          </Btn>
        </View>
      </ScrollView>
    </View>
  );
}

/** The layered purple/cyan glow behind the logo (mirrors .welcome-orb). */
function WelcomeOrb(): React.JSX.Element {
  const s = 130;
  return (
    <View style={styles.orb}>
      <Svg width={s} height={s} viewBox="0 0 130 130" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orb1" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.purple} stopOpacity={0.4} />
            <Stop offset="0.7" stopColor={colors.purple} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="orb2" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.32} />
            <Stop offset="0.7" stopColor={colors.cyan} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={65} cy={65} r={65} fill="url(#orb1)" />
        <Circle cx={85} cy={73} r={65} fill="url(#orb2)" />
      </Svg>
      <LogoMark size={64} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: space[6], paddingBottom: space[5] },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22, paddingTop: space[5] },
  orb: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  pitch: { alignItems: 'center' },
  h1: {
    fontSize: fontSize['3xl'],
    fontWeight: '600',
    letterSpacing: -0.6,
    lineHeight: 35,
    color: colors.fg,
    textAlign: 'center',
  },
  sub: {
    fontSize: fontSize.md,
    color: colors.fgMuted,
    marginTop: space[3],
    maxWidth: 300,
    lineHeight: 22,
    textAlign: 'center',
  },
  cards: { flexDirection: 'row', gap: space[3], alignSelf: 'stretch', marginTop: space[1] },
  cardCol: { flex: 1 },
  actions: { gap: space[3] - 2 },
});
