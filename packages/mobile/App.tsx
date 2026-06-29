import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { runHermesChecks, type CheckResult } from './src/hermes-smoke';

export default function App() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    runHermesChecks()
      .then(setResults)
      .catch((e) => setFatal(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>@tezosx/wallet-core on Hermes</Text>
      <Text style={styles.subtitle}>shared core imported from the workspace</Text>

      {fatal != null && (
        <Text style={styles.fatal}>Fatal (core failed to load/run):{'\n'}{fatal}</Text>
      )}
      {results == null && fatal == null && <Text style={styles.muted}>Running checks…</Text>}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {results?.map((r) => (
          <View key={r.name} style={styles.row}>
            <Text style={[styles.badge, r.ok ? styles.ok : styles.fail]}>{r.ok ? 'PASS' : 'FAIL'}</Text>
            <View style={styles.rowText}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.detail} selectable>{r.detail}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0b16', paddingTop: 72, paddingHorizontal: 20 },
  title:     { color: '#f4f1fb', fontSize: 20, fontWeight: '700' },
  subtitle:  { color: '#9b91b8', fontSize: 13, marginTop: 2, marginBottom: 20 },
  muted:     { color: '#9b91b8', fontSize: 15 },
  fatal:     { color: '#ff6b6b', fontSize: 14, marginBottom: 16 },
  list:      { flex: 1 },
  listContent: { gap: 12 },
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#1a1626', borderRadius: 12, padding: 14 },
  rowText:   { flex: 1 },
  badge:     { fontSize: 12, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 9999, overflow: 'hidden' },
  ok:        { backgroundColor: '#143a2a', color: '#4ade80' },
  fail:      { backgroundColor: '#3a1414', color: '#ff6b6b' },
  name:      { color: '#f4f1fb', fontSize: 15, fontWeight: '600' },
  detail:    { color: '#9b91b8', fontSize: 13, marginTop: 4 },
});
