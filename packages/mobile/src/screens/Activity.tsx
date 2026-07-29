/**
 * Activity — the transaction history for the active account. A dismissible stale
 * band warns when one source is catching up; a direction segmented control
 * (All/Sent/Received) plus a runtime filter Sheet (All/Michelson/EVM/Cross) narrow the
 * list. Matching items are grouped by day (Today/Yesterday/Earlier) and rendered
 * as ActivityRows; an EmptyState covers both "nothing yet" and "no matches".
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import { Icon } from '../ui/icon';
import { ActivityRow } from '../ui/tx/ActivityRow';
import { EmptyState } from '../ui/tx/EmptyState';
import { ErrorCard } from '../ui/tx/ErrorCard';
import { IconBtn } from '../ui/tx/IconBtn';
import { Sheet } from '../ui/tx/Sheet';
import { Spinner } from '../ui/tx/Spinner';
import { TopBar } from '../ui/tx/TopBar';
import type { ActivityRowVM } from '../wallet/activity-vm';
import { useWallet } from '../wallet/context';

type Dir = 'all' | 'sent' | 'received';
type RuntimeFilter = 'all' | 'l1' | 'l2' | 'cross';

interface DayGroup {
  label: string;
  items: ActivityRowVM[];
}

const DAY = 86400000;

function groupByDay(items: ActivityRowVM[], now: number): DayGroup[] {
  const buckets: Record<string, ActivityRowVM[]> = { Today: [], Yesterday: [], Earlier: [] };
  items.forEach((i) => {
    const age = now - i.ts;
    if (age < DAY) buckets.Today.push(i);
    else if (age < 2 * DAY) buckets.Yesterday.push(i);
    else buckets.Earlier.push(i);
  });
  return (['Today', 'Yesterday', 'Earlier'] as const)
    .map((label) => ({ label, items: buckets[label] }))
    .filter((g) => g.items.length > 0);
}

const RUNTIME_OPTIONS: { v: RuntimeFilter; l: string; accent: 'purple' | 'cyan' }[] = [
  { v: 'all', l: 'All runtimes', accent: 'purple' },
  { v: 'l1', l: 'Michelson runtime', accent: 'purple' },
  { v: 'l2', l: 'EVM runtime', accent: 'cyan' },
  { v: 'cross', l: 'Cross-runtime', accent: 'cyan' },
];

export function Activity(): React.JSX.Element {
  const ctx = useWallet();
  const activityData = ctx.activity;
  const all = activityData.data?.items ?? [];
  const [dir, setDir] = useState<Dir>('all');
  const [runtimeF, setRuntimeF] = useState<RuntimeFilter>('all');
  const [popOpen, setPopOpen] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);

  const items = useMemo(
    () =>
      all.filter(
        (i) =>
          (dir === 'all' || i.dir === (dir === 'sent' ? 'out' : 'in')) &&
          (runtimeF === 'all' || i.runtime === runtimeF),
      ),
    [all, dir, runtimeF],
  );

  const now = Date.now();
  const groups = useMemo(() => groupByDay(items, now), [items, now]);
  const filtered = dir !== 'all' || runtimeF !== 'all';
  const stale = activityData.data != null && activityData.data.staleness !== 'fresh';
  const loading = activityData.loading && all.length === 0;

  return (
    <View style={styles.screen}>
      <TopBar
        title="Activity"
        right={<IconBtn name="refresh" label="Refresh" onPress={() => ctx.refreshData()} />}
      />

      {stale && !staleDismissed && (
        <View style={styles.staleBand}>
          <Icon name="info" size={15} color={colors.warning} />
          <Text style={styles.staleText}>
            <Text style={styles.staleStrong}>Activity may be delayed</Text> · one source is catching up
          </Text>
          <Pressable style={styles.staleX} onPress={() => setStaleDismissed(true)}>
            <Icon name="x" size={14} color={colors.fgSubtle} />
          </Pressable>
        </View>
      )}

      <View style={styles.filters}>
        <View style={styles.seg}>
          {(['all', 'sent', 'received'] as const).map((d) => (
            <Pressable
              key={d}
              style={[styles.segBtn, dir === d && styles.segBtnOn]}
              onPress={() => setDir(d)}
            >
              <Text style={[styles.segText, dir === d && styles.segTextOn]}>
                {d[0].toUpperCase() + d.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.runtimeBtn, runtimeF !== 'all' && styles.runtimeBtnOn]}
          onPress={() => setPopOpen((o) => !o)}
        >
          <Icon name="grid" size={18} color={runtimeF !== 'all' ? colors.fg : colors.fgMuted} />
          {runtimeF !== 'all' && <View style={styles.runtimeDot} />}
        </Pressable>
      </View>

      {activityData.error != null ? (
        <View style={styles.stateWrap}>
          <ErrorCard title={activityData.error.title} detail={activityData.error.detail} />
        </View>
      ) : loading ? (
        <View style={styles.stateWrap}>
          <Spinner />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icon name="list" size={22} color={colors.fgMuted} />}
          title="No activity yet"
          detail={
            filtered
              ? 'No transactions match this filter.'
              : 'Send or receive XTZ and your transactions will show up here.'
          }
          action={filtered ? undefined : { label: 'Receive', onPress: () => ctx.nav.push('receive') }}
        />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {groups.map((g) => (
            <View key={g.label}>
              <Text style={styles.groupHead}>{g.label}</Text>
              {g.items.map((it) => (
                <ActivityRow key={it.id} item={it} now={now} onPress={() => ctx.toast('Opening in explorer…')} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {popOpen && (
        <Sheet title="Filter by runtime" onClose={() => setPopOpen(false)}>
          <View style={styles.grid}>
            {RUNTIME_OPTIONS.map(({ v, l, accent }) => {
              const sel = runtimeF === v;
              return (
                <Pressable
                  key={v}
                  style={[
                    styles.kindCard,
                    sel && (accent === 'cyan' ? styles.kindCardSelCyan : styles.kindCardSelPurple),
                  ]}
                  onPress={() => {
                    setRuntimeF(v);
                    setPopOpen(false);
                  }}
                >
                  <Text style={styles.kindCardText}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 12 },
  stateWrap: { paddingHorizontal: space[4], paddingTop: 40, alignItems: 'center' },

  staleBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,184,76,0.07)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,184,76,0.18)',
  },
  staleText: { flex: 1, fontSize: fontSize.xs, color: colors.fgMuted },
  staleStrong: { color: colors.fg, fontWeight: '600' },
  staleX: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },

  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4 },
  segBtn: { height: 30, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.surface3 },
  segText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.fgMuted },
  segTextOn: { color: colors.fg },
  runtimeBtn: {
    marginLeft: 'auto',
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runtimeBtnOn: {},
  runtimeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.purple,
    borderWidth: 2,
    borderColor: colors.bg,
  },

  groupHead: {
    paddingTop: 16,
    paddingHorizontal: space[5],
    paddingBottom: 6,
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4, paddingBottom: 12 },
  kindCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  kindCardSelPurple: { borderColor: colors.purpleLine, backgroundColor: colors.purpleBg },
  kindCardSelCyan: { borderColor: colors.cyanLine, backgroundColor: colors.cyanBg },
  kindCardText: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
});
