/**
 * Connections: the connected-dApp management screen. Lists the live WalletConnect
 * sessions (name / url / the account exposed to each) and lets the user revoke
 * one from the wallet side. It reads directly from WalletKit's active sessions —
 * the source of truth — and re-reads whenever the session set changes (a
 * disconnect here, or a dApp deleting its session). Revoking also clears the
 * stored session that gates eth_accounts (via the reconcile subscribed in the
 * connect orchestration).
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { listSessions, subscribeSessions, disconnectSession, type WcSession } from '../transport/walletconnect';
import { colors } from '../theme';

export function Connections({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [sessions, setSessions] = useState<WcSession[]>(() => listSessions());

  useEffect(() => subscribeSessions(() => setSessions(listSessions())), []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Connections</Text>
        <Pressable onPress={onClose}><Text style={styles.done}>Done</Text></Pressable>
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.empty}>No connected dApps.</Text>
      ) : (
        sessions.map((s) => (
          <View key={s.topic} style={styles.card}>
            <Text style={styles.name}>{s.name}</Text>
            <Text style={styles.url}>{s.url}</Text>
            {s.account !== '' && <Text style={styles.account}>{shortAddr(s.account)}</Text>}
            <Pressable style={styles.disconnect} onPress={() => void disconnectSession(s.topic)}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { padding: 20, paddingTop: 72, gap: 16 },
  headerRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:          { color: colors.fg, fontSize: 24, fontWeight: '700' },
  done:           { color: colors.cyan, fontSize: 15, fontWeight: '600' },
  empty:          { color: colors.fgMuted, fontSize: 15, marginTop: 8 },
  card:           { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 4 },
  name:           { color: colors.fg, fontSize: 16, fontWeight: '600' },
  url:            { color: colors.cyan, fontSize: 13 },
  account:        { color: colors.fgMuted, fontSize: 13 },
  disconnect:     { borderColor: colors.danger, borderWidth: 1, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  disconnectText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
