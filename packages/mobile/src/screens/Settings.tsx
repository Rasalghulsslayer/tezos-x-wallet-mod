/**
 * Settings — the wallet's settings tab (mirrors the design's SettingsScreen).
 * The active account header (taps into the switcher) sits above three sections:
 * Wallet (connections, add account, manage tokens, explorers), Security (reveal
 * secret, lock), and About (version, network). The explorer rows and the tzkt
 * row are runtime-aware — a tz1 account also exposes the Michelson explorer.
 * "Reveal secret" opens a password-gated bottom sheet; "Change password"
 * opens a three-field sheet that re-seals the vault (and the biometric unlock
 * secret) under a new password.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, font, radius, space } from '../theme';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { AccountHeader } from '../ui/tx/AccountHeader';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { LinkRow } from '../ui/tx/LinkRow';
import { Sheet } from '../ui/tx/Sheet';
import { exportSecret } from '@tezosx/wallet-core/use-cases/export-secret';
import { exportWalletSeed } from '@tezosx/wallet-core/use-cases/export-wallet-seed';
import { formatError, type FormattedError } from '@tezosx/wallet-core/domain/error';
import { useWallet } from '../wallet/context';
import { keyring } from '../composition/wiring';
import type { ViewAccount } from '../wallet/view-account';
import { version as APP_VERSION } from '../../package.json';
import { version as CORE_VERSION } from '@tezosx/wallet-core/package.json';

export function Settings(): React.JSX.Element {
  const ctx = useWallet();
  const acc = ctx.activeAccount;
  const isEvm = acc.kind === 'evm';
  const [reveal, setReveal] = useState(false);
  const [revealSeed, setRevealSeed] = useState(false);
  const [changePwd, setChangePwd] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.topbarTitle}>Settings</Text>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <AccountHeader account={acc} label={ctx.labelFor(acc)} onOpen={() => ctx.openSwitcher()} copyAddr={ctx.copy} />
        </View>

        <SectionHead label="Wallet" />
        <LinkRow icon="link" title="Connected sites" onPress={() => ctx.nav.goTab('connections')} />
        <LinkRow icon="plus" title="Add account" sub="Create or import another account" onPress={() => ctx.nav.push('addAccount')} />
        <LinkRow icon="wallet" title="Manage tokens" sub="Add or remove custom ERC-20" onPress={() => ctx.nav.push('tokens')} />
        <LinkRow icon="list" title="Contacts" sub="Name the addresses you send to" onPress={() => ctx.nav.push('contacts')} />
        <LinkRow
          icon="globe"
          title="Blockscout (EVM)"
          sub={isEvm ? 'EVM explorer' : 'EVM explorer · alias'}
          onPress={() => ctx.toast('Opening Blockscout…')}
          trailing={<Icon name="external-link" size={16} color={colors.fgSubtle} />}
        />
        {!isEvm && (
          <LinkRow
            icon="globe"
            title="tzkt (Michelson runtime)"
            sub="Tezos explorer"
            onPress={() => ctx.toast('Opening tzkt…')}
            trailing={<Icon name="external-link" size={16} color={colors.fgSubtle} />}
          />
        )}

        <SectionHead label="Security" />
        <LinkRow
          icon="key"
          title="Change password"
          sub="Re-encrypt the vault with a new password"
          onPress={() => setChangePwd(true)}
        />
        <LinkRow
          icon="shield"
          title="Reveal secret"
          sub={isEvm ? 'EVM private key' : 'Private key for this account'}
          onPress={() => setReveal(true)}
        />
        {ctx.hasSeed && (
          <LinkRow
            icon="key"
            title="Reveal seed phrase"
            sub="Controls every account derived from it"
            onPress={() => setRevealSeed(true)}
          />
        )}
        <LinkRow icon="lock" title="Lock wallet" onPress={ctx.lock} trailing={<View />} />

        <SectionHead label="About" />
        <LinkRow icon="info" title="Version" sub={`Wallet v${APP_VERSION} · Core v${CORE_VERSION}`} trailing={<View />} />
        <LinkRow icon="info" title="Network" sub="Tezos X Previewnet" trailing={<View />} />
        <View style={styles.foot} />
      </ScrollView>

      {reveal && <RevealSheet account={acc} onClose={() => setReveal(false)} />}
      {revealSeed && <RevealSheet account={acc} walletSeed onClose={() => setRevealSeed(false)} />}
      {changePwd && <ChangePasswordSheet onClose={() => setChangePwd(false)} />}
    </View>
  );
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const ctx = useWallet();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<{ title: string; detail?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Every way out of the sheet scrubs all three password fields first — the
  // strings stay GC-bound, but nothing keeps referencing them.
  const close = (): void => {
    setCurrent('');
    setNext('');
    setConfirm('');
    onClose();
  };

  const submit = (): void => {
    if (busy) return;
    setErr(null);
    if (next.length < 8) { setErr({ title: 'Password must be at least 8 characters' }); return; }
    if (next !== confirm) { setErr({ title: 'Passwords do not match' }); return; }
    setBusy(true);
    void (async () => {
      try {
        await ctx.changePassword(current, next);
        close();
        ctx.toast('Password changed');
      } catch (e) {
        const f: FormattedError = formatError(e);
        setErr({ title: f.title, detail: f.detail });
        setCurrent(''); // the rejected password should not linger in the field
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Sheet title="Change password" onClose={close}>
      <View style={styles.revealBody}>
        <Text style={styles.revealIntro}>
          Re-encrypts the vault on this device with a new password. Your accounts and secrets are
          unchanged; biometric unlock is re-sealed automatically.
        </Text>
        <View style={styles.pwdFields}>
          <View>
            <Text style={styles.fieldLabel}>Current password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={current}
              autoFocus
              placeholder="Current password"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={(t) => { setCurrent(t); setErr(null); }}
            />
          </View>
          <View>
            <Text style={styles.fieldLabel}>New password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={next}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={(t) => { setNext(t); setErr(null); }}
            />
          </View>
          <View>
            <Text style={styles.fieldLabel}>Confirm new password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirm}
              placeholder="Re-enter new password"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              onChangeText={(t) => { setConfirm(t); setErr(null); }}
            />
          </View>
        </View>
        {err != null && <ErrorInline title={err.title} detail={err.detail} />}
        <Btn
          variant="accent"
          full
          loading={busy}
          disabled={current.length === 0 || next.length === 0 || confirm.length === 0}
          onPress={submit}
          style={styles.revealBtn}
        >
          Change password
        </Btn>
      </View>
    </Sheet>
  );
}

function SectionHead({ label }: { label: string }): React.JSX.Element {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionText}>{label}</Text>
    </View>
  );
}

// How long a revealed secret stays on screen before the sheet scrubs itself —
// enough to copy a phrase to paper, short enough not to linger on a table.
const REVEAL_AUTO_CLOSE_MS = 30_000;

function RevealSheet({
  account,
  walletSeed = false,
  onClose,
}: {
  account: ViewAccount;
  /** Reveal the wallet-level seed phrase instead of this account's own secret. */
  walletSeed?: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const [pwd, setPwd] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<FormattedError | null>(null);
  const [busy, setBusy] = useState(false);
  const isEvm = account.kind === 'evm';

  // Every way out of the sheet scrubs the password and the revealed secret
  // first — the strings stay GC-bound, but nothing keeps referencing them.
  const close = (): void => {
    setPwd('');
    setSecret(null);
    onClose();
  };

  useEffect(() => {
    if (secret == null) return;
    const t = setTimeout(close, REVEAL_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  const submit = (): void => {
    if (pwd.length === 0 || busy) return;
    setErr(null);
    setBusy(true);
    void (async () => {
      try {
        const value = walletSeed
          ? await exportWalletSeed({ password: pwd }, { keyring })
          : (await exportSecret({ password: pwd, accountId: account.id }, { keyring })).value;
        setSecret(value);
        setPwd(''); // the password has done its job once the secret is shown
      } catch (e) {
        setErr(formatError(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Sheet title={walletSeed ? 'Reveal seed phrase' : 'Reveal secret'} onClose={close}>
      <View style={styles.revealBody}>
        {secret == null ? (
          <>
            <Text style={styles.revealIntro}>
              {walletSeed ? (
                <>
                  Enter your password to reveal your wallet&rsquo;s seed phrase. It controls every account
                  derived from it. Never share it.
                </>
              ) : (
                <>
                  Enter your password to reveal the {isEvm ? 'private key' : 'signing secret'} for{' '}
                  <Text style={styles.revealStrong}>{account.label}</Text>. Never share it.
                </>
              )}
            </Text>
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
            />
            {err != null && <ErrorInline title={err.title} detail={err.detail} />}
            <Btn variant="accent" full loading={busy} disabled={pwd.length === 0} onPress={submit} style={styles.revealBtn}>
              Reveal
            </Btn>
          </>
        ) : (
          <>
            <View style={styles.warnBanner}>
              <Icon name="alert" size={18} color={colors.danger} />
              <View style={styles.warnBody}>
                <Text style={styles.warnTitle}>Keep this private</Text>
                <Text style={styles.warnDetail}>
                  Anyone with {isEvm ? 'this key' : 'these words'} can move your funds. Don’t screenshot or paste it
                  anywhere.
                </Text>
              </View>
            </View>
            <View style={styles.secretCard}>
              <Text style={styles.secretText}>{secret}</Text>
            </View>
            <Btn variant="outline" full onPress={close} style={styles.revealBtn}>
              Done
            </Btn>
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topbarTitle: { fontSize: fontSize.lg, fontWeight: '600', letterSpacing: -0.17, color: colors.fg },
  scroll: { flex: 1 },
  headerWrap: { paddingTop: 12, paddingBottom: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionText: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.fgSubtle, fontWeight: '600' },
  foot: { height: 16 },

  revealBody: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 16 },
  revealIntro: { fontSize: fontSize.sm, color: colors.fgMuted, marginBottom: 16, lineHeight: 20 },
  revealStrong: { color: colors.fg, fontWeight: '600' },
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
  revealBtn: { marginTop: 14 },
  pwdFields: { gap: space[3] },
  fieldLabel: { fontSize: fontSize.sm, color: colors.fgMuted, marginBottom: space[2] },
  warnBanner: {
    marginTop: 4,
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
  secretCard: { marginTop: 14, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 16 },
  secretText: { fontFamily: font.mono, fontSize: fontSize.sm, color: colors.fg, lineHeight: 23 },
});
