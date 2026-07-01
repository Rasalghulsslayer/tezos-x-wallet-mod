/**
 * Unlock — the returning-user password screen (mirrors the design's
 * UnlockScreen). Brand mark + "Welcome back", a single password field, and a
 * ghost link back to onboarding for a lost password. Mock: any non-empty
 * password unlocks; the literal "wrong" demonstrates the error state.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import { useWallet } from '../wallet/context';
import { Btn } from '../ui/tx/Btn';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { LogoMark } from '../ui/tx/LogoMark';

export function Unlock(): React.JSX.Element {
  const ctx = useWallet();
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = (): void => {
    if (!pwd) return;
    if (pwd.toLowerCase() === 'wrong') {
      setErr('Incorrect password');
      setPwd('');
      return;
    }
    ctx.unlock();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <LogoMark size={56} />
          <View style={styles.pitch}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.sub}>Enter your password to unlock.</Text>
          </View>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoFocus
            value={pwd}
            placeholder="Password"
            placeholderTextColor={colors.fgSubtle}
            autoCapitalize="none"
            onChangeText={(v) => {
              setPwd(v);
              setErr(null);
            }}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          {err != null && <ErrorInline title={err} />}
          <Btn variant="accent" full disabled={!pwd} onPress={submit}>
            Unlock
          </Btn>
        </View>

        <Pressable onPress={() => ctx.resetToWelcome()} style={styles.forgot}>
          <Text style={styles.forgotText}>Forgot password? Import with seed phrase</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 44, paddingBottom: space[6] },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 },
  pitch: { alignItems: 'center' },
  title: { fontSize: fontSize['2xl'], fontWeight: '600', letterSpacing: -0.36, color: colors.fg },
  sub: { fontSize: fontSize.md, color: colors.fgMuted, marginTop: space[2] },
  form: { gap: space[3] },
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
  forgot: { marginTop: space[4], alignItems: 'center' },
  forgotText: { color: colors.fgMuted, fontSize: fontSize.sm },
});
