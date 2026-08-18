/**
 * DiscardOverlay — full-screen interception shown when the user backs out of
 * the fresh-key input after revealing the secret but before confirming: the
 * key exists nowhere else yet, so leaving silently would lose it. Offers an
 * explicit Stay / Discard choice; Discard is the destructive action.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius } from '../../theme';
import { Icon } from '../icon';
import { Btn } from './Btn';

export function DiscardOverlay({
  onStay,
  onDiscard,
}: {
  onStay: () => void;
  onDiscard: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.scrim} accessibilityViewIsModal accessibilityLabel="Discard the new key?">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Icon name="alert" size={22} color={colors.warning} />
        </View>
        <Text style={styles.title}>Discard the new key?</Text>
        <Text style={styles.body}>
          You’ve generated a fresh secret but haven’t backed it up yet. Leaving now loses this key
          permanently.
        </Text>
        <View style={styles.btnRow}>
          <Btn variant="outline" style={styles.btn} onPress={onStay}>Stay</Btn>
          <Btn variant="danger" style={styles.btn} onPress={onDiscard}>Discard</Btn>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 22,
    paddingVertical: 26,
    gap: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg, textAlign: 'center' },
  body: { fontSize: fontSize.sm, color: colors.fgMuted, lineHeight: 20, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' },
  btn: { flex: 1 },
});
