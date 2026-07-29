/**
 * Sheet — the bottom-sheet container (mirrors mobile.css .overlay + .sheet).
 * A dimmed scrim (tap to dismiss) with a rounded-top panel that slides up: grip,
 * an optional header (title, a right slot, and a close button), and a scrollable
 * body. Tapping the panel itself is swallowed so it doesn't close the sheet.
 */

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, safe } from '../../theme';
import { IconBtn } from './IconBtn';

export function Sheet({
  title,
  onClose,
  children,
  right,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          {(title != null || right != null) && (
            <View style={styles.head}>
              {title != null && <Text style={styles.title}>{title}</Text>}
              <View style={styles.spacer} />
              {right}
              <IconBtn name="x" onPress={onClose} label="Close" size={20} />
            </View>
          )}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    paddingBottom: safe.bottom,
    overflow: 'hidden',
  },
  grip: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  head: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg },
  spacer: { flex: 1 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16 },
});
