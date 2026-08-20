/**
 * Connections — the connected-sites screen (mirrors the design's
 * ConnectionsScreen). Lists the live sessions with the account each is bound to
 * and lets the user revoke one. When more than one account exists, a filter
 * toggles between all sessions and just this account's. The top-bar scan action
 * opens the connect approval sheet.
 */

import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatError } from '@tezosx/wallet-core/domain/error';
import type { StoredSession } from '@tezosx/wallet-core/ports/session-store';
import { colors, fontSize, font, radius, space } from '../theme';
import { timeAgo } from '@tezosx/wallet-core/shared/format';
import { originDisplay } from '@tezosx/wallet-core/shared/approval-display';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { EmptyState } from '../ui/tx/EmptyState';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { IconBtn } from '../ui/tx/IconBtn';
import { Sheet } from '../ui/tx/Sheet';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';
import { ScanConnect } from './ScanConnect';


type Filter = 'all' | 'active';

export function Connections(): React.JSX.Element {
  const ctx = useWallet();
  const [filter, setFilter] = useState<Filter>('all');
  const [connectMode, setConnectMode] = useState<'none' | 'scan' | 'paste'>('none');
  const multi = ctx.accounts.length > 1;

  // Ask how to pair, then open the camera or the paste sheet. Using a native
  // chooser (not another sheet) so it fully dismisses before the camera modal
  // presents — avoids the iOS present-while-dismissing race.
  const chooseConnect = (): void => {
    Alert.alert('Connect a dApp', 'How do you want to connect?', [
      { text: 'Scan QR code', onPress: () => setConnectMode('scan') },
      { text: 'Paste a link', onPress: () => setConnectMode('paste') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const sessions = ctx.sessions.filter((s) => filter === 'all' || s.accountId === ctx.activeAccount.id);

  return (
    <View style={styles.screen}>
      <TopBar
        title="Connected sites"
        right={<IconBtn name="scan" label="Connect a dApp" onPress={chooseConnect} />}
      />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {multi && (
          <View style={styles.filter}>
            {(['all', 'active'] as const).map((f) => (
              <Btn
                key={f}
                variant={filter === f ? 'primary' : 'ghost'}
                onPress={() => setFilter(f)}
                style={[styles.filterBtn, filter === f ? styles.filterOn : styles.filterOff]}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
                  {f === 'all' ? 'All accounts' : 'This account'}
                </Text>
              </Btn>
            ))}
          </View>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            icon={<Icon name="link" size={22} color={colors.fgMuted} />}
            title={filter === 'active' ? 'No dApps with this account' : 'No connected dApps'}
            detail={
              filter === 'active'
                ? 'Switch to “All accounts” to see sessions tied to other accounts.'
                : 'When a website asks to connect, you’ll review and approve it here.'
            }
            action={filter === 'all' ? { label: 'Connect a dApp', onPress: chooseConnect } : undefined}
          />
        ) : (
          <View style={styles.list}>
            {sessions.map((s) => (
              <ConnectionRow key={s.origin} session={s} />
            ))}
          </View>
        )}
      </ScrollView>

      {connectMode === 'scan' && <ScanConnect onClose={() => setConnectMode('none')} />}
      {connectMode === 'paste' && <ConnectSheet onClose={() => setConnectMode('none')} />}
    </View>
  );
}

/** Paste a WalletConnect `wc:` URI to pair; the incoming proposal then raises the
 *  Approve modal automatically (no camera QR scanner yet). */
function ConnectSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const ctx = useWallet();
  const [uri, setUri] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = (): void => {
    const value = uri.trim();
    if (busy || value === '') return;
    setBusy(true);
    setErr(null);
    void (async () => {
      try {
        await ctx.connect(value);
        onClose();
      } catch (e) {
        setErr(formatError(e).detail);
        setBusy(false);
      }
    })();
  };

  return (
    <Sheet title="Connect a dApp" onClose={onClose}>
      <View style={styles.connectBody}>
        <Text style={styles.connectLead}>Paste the WalletConnect link from the dApp (it starts with “wc:”).</Text>
        <TextInput
          style={styles.connectInput}
          value={uri}
          onChangeText={setUri}
          placeholder="wc:…"
          placeholderTextColor={colors.fgSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
        />
        {err != null && <ErrorInline title={err} />}
        <Btn variant="accent" full loading={busy} disabled={uri.trim() === ''} onPress={submit}>
          Connect
        </Btn>
      </View>
    </Sheet>
  );
}

function ConnectionRow({ session }: { session: StoredSession }): React.JSX.Element {
  const ctx = useWallet();
  const { title: host, favLetter } = originDisplay(session.origin);
  const label = ctx.labelFor(ctx.accounts.find((a) => a.id === session.accountId));

  return (
    <View style={styles.row}>
      <View style={styles.fav}>
        <Text style={styles.favText}>{favLetter}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.host} numberOfLines={1}>
          {host}
        </Text>
        <View style={styles.meta}>
          <Icon name="info" size={11} color={colors.fgSubtle} />
          <Text style={styles.metaText} numberOfLines={1}>
            {timeAgo(session.connectedAt)} · {label}
          </Text>
        </View>
      </View>
      <Btn variant="danger" size="sm" onPress={() => ctx.disconnect(session.origin)}>
        Disconnect
      </Btn>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  filter: { flexDirection: 'row', gap: 4, paddingVertical: 12, paddingHorizontal: 16 },
  filterBtn: { flex: 1, height: 40, borderRadius: radius.md, paddingHorizontal: 0 },
  filterOn: { backgroundColor: colors.surface3, borderColor: 'transparent' },
  filterOff: { backgroundColor: colors.surface2, borderColor: 'transparent' },
  filterText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.fgMuted },
  filterTextOn: { color: colors.fg },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  fav: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favText: { color: colors.fg, fontWeight: '700', fontSize: 17 },
  body: { flex: 1, minWidth: 0 },
  host: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metaText: { fontSize: fontSize.xs, color: colors.fgSubtle, flexShrink: 1, fontFamily: font.sans },
  connectBody: { paddingBottom: 8, gap: 14 },
  connectLead: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 20 },
  connectInput: {
    minHeight: 72,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: fontSize.sm,
    paddingHorizontal: 16,
    paddingVertical: 12,
    lineHeight: 20,
  },
});
