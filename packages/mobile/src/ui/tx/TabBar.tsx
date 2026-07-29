/**
 * TabBar — the bottom navigation (mirrors mobile.css .tabs). Four fixed tabs
 * (Home / Activity / dApps / Settings); the active tab lifts its label to full
 * foreground and tints its icon purple. `badges` renders a count pill on a tab
 * (used for pending dApp approvals).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, safe } from '../../theme';
import { Icon, type IconName } from '../icon';

export type TabId = 'home' | 'activity' | 'connections' | 'settings';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'activity', label: 'Activity', icon: 'list' },
  { id: 'connections', label: 'dApps', icon: 'link' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function TabBar({
  active,
  onSelect,
  badges = {},
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
  badges?: Partial<Record<TabId, number>>;
}): React.JSX.Element {
  return (
    <View style={styles.tabs}>
      {TABS.map((t) => {
        const on = active === t.id;
        const count = badges[t.id] ?? 0;
        return (
          <Pressable key={t.id} style={styles.tab} onPress={() => onSelect(t.id)}>
            <View>
              <Icon
                name={t.icon}
                size={22}
                strokeWidth={on ? 2 : 1.7}
                color={on ? colors.purple : colors.fgSubtle}
              />
              {count > 0 && (
                <View style={styles.badgeDot}>
                  <Text style={styles.badgeDotText}>{count}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: safe.bottom,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontWeight: '600',
    color: colors.fgSubtle,
  },
  labelOn: { color: colors.fg },
  badgeDot: {
    position: 'absolute',
    top: -4,
    left: 12,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeDotText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
