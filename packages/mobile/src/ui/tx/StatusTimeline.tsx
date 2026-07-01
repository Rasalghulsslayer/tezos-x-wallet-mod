/**
 * StatusTimeline — the Send progress rail (mirrors mobile.css .timeline). Three
 * fixed rows (Broadcasted / Included / Finalized). Completed rows get a filled
 * success dot with a check; the current row gets a pulsing purple dot; upcoming
 * rows are hollow. The "Broadcasted" caption adapts to the runtime.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../../theme';
import { Icon } from '../icon';

export type TimelineStage = 'broadcasting' | 'included' | 'finalized' | 'confirmed';

const ORDER: Exclude<TimelineStage, 'confirmed'>[] = ['broadcasting', 'included', 'finalized'];

export function StatusTimeline({
  stage,
  runtime,
}: {
  stage: TimelineStage;
  runtime: 'l1' | 'l2';
}): React.JSX.Element {
  const idx = ORDER.indexOf(stage === 'confirmed' ? 'finalized' : stage);
  const rows = [
    { t: 'Broadcasted', m: runtime === 'l1' ? 'Signed & injected on Tezos L1' : 'Submitted to the EVM runtime' },
    { t: 'Included', m: 'Picked up in a block' },
    { t: 'Finalized', m: '≥ 2 confirmations' },
  ];

  return (
    <View style={styles.timeline}>
      {rows.map((r, i) => {
        const state: 'done' | 'active' | 'idle' = i < idx ? 'done' : i === idx ? 'active' : 'idle';
        return (
          <View key={i} style={styles.row}>
            <View style={styles.dotCol}>
              <Dot state={state} />
              {i < rows.length - 1 && <View style={styles.line} />}
            </View>
            <View style={styles.body}>
              <Text style={[styles.t, state === 'idle' && styles.tIdle]}>{r.t}</Text>
              <Text style={styles.m}>{r.m}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Dot({ state }: { state: 'done' | 'active' | 'idle' }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== 'active') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  if (state === 'done') {
    return (
      <View style={[styles.dot, styles.dotDone]}>
        <Icon name="check" size={9} color="#04121A" strokeWidth={3} />
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={styles.activeWrap}>
        <Animated.View
          style={[
            styles.pulseRing,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
            },
          ]}
        />
        <View style={[styles.dot, styles.dotActive]} />
      </View>
    );
  }
  return <View style={[styles.dot, styles.dotIdle]} />;
}

const styles = StyleSheet.create({
  timeline: { width: '100%', marginTop: 8 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  dotCol: { width: 24, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dotIdle: { borderWidth: 2, borderColor: colors.surface3, backgroundColor: colors.bg },
  dotDone: { backgroundColor: colors.success, borderWidth: 2, borderColor: colors.success },
  dotActive: { backgroundColor: colors.purple, borderWidth: 2, borderColor: colors.purple },
  activeWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.purple,
  },
  line: { flex: 1, width: 2, backgroundColor: colors.surface3, marginVertical: 3 },
  body: { flex: 1, paddingBottom: 4 },
  t: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  tIdle: { color: colors.fgSubtle },
  m: { fontSize: fontSize.xs, color: colors.fgMuted, marginTop: 1 },
});
