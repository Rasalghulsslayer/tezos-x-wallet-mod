/**
 * ScanConnect — full-screen QR scanner to pair a dApp over WalletConnect. Asks
 * for camera permission, scans the dApp's `wc:` QR, and hands the URI to
 * ctx.connect (the incoming proposal then raises the Approve sheet). Falls back
 * to a "Paste link instead" affordance when the camera is denied or the dApp
 * runs on desktop.
 */

import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { colors, fontSize, radius, safe } from '../theme';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { useWallet } from '../wallet/context';

export function ScanConnect({ onClose }: { onClose: () => void }): React.JSX.Element {
  const ctx = useWallet();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handled = useRef(false);

  // Prompt for camera access on open; a no-op if already granted or permanently denied.
  useEffect(() => {
    void requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const granted = permission?.granted === true;

  const onBarcode = (result: BarcodeScanningResult): void => {
    const uri = result.data.trim();
    // Ignore non-WalletConnect QRs and re-fires after the first accepted scan.
    if (handled.current || busy || !uri.startsWith('wc:')) return;
    handled.current = true;
    setBusy(true);
    setErr(null);
    void (async () => {
      try {
        await ctx.connect(uri);
        onClose();
      } catch (e) {
        setErr(formatError(e).detail);
        handled.current = false;
        setBusy(false);
      }
    })();
  };

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : onBarcode}
          />
        ) : (
          <View style={styles.permWrap}>
            <Icon name="scan" size={40} color={colors.fgMuted} />
            <Text style={styles.permTitle}>Scan a dApp's QR code</Text>
            <Text style={styles.permSub}>
              {permission != null && !permission.canAskAgain
                ? 'Camera access is off — enable it in Settings, or paste the link instead.'
                : 'Allow camera access to scan the WalletConnect QR shown by the dApp.'}
            </Text>
            {(permission == null || permission.canAskAgain) && (
              <Btn variant="accent" full onPress={() => void requestPermission()}>
                Allow camera
              </Btn>
            )}
          </View>
        )}

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.header}>
            <Pressable style={styles.close} onPress={onClose} hitSlop={10}>
              <Icon name="x" size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitle}>Scan to connect</Text>
            <View style={styles.close} />
          </View>

          {granted && (
            <View style={styles.frameWrap} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>Point at the dApp's WalletConnect QR</Text>
            </View>
          )}

          {(err != null || busy) && (
            <View style={styles.footer}>
              {err != null && <Text style={styles.err}>{err}</Text>}
              {busy && <Text style={styles.connecting}>Connecting…</Text>}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  permWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
    backgroundColor: colors.bg,
  },
  permTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.fg, marginTop: 4 },
  permSub: { fontSize: fontSize.sm, color: colors.fgMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: safe.top + 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '600' },

  frameWrap: { alignItems: 'center', gap: 16 },
  frame: {
    width: 232,
    height: 232,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  hint: { color: '#FFFFFF', fontSize: fontSize.sm, textAlign: 'center', paddingHorizontal: 24 },

  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: safe.bottom + 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  err: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  connecting: { color: '#FFFFFF', fontSize: fontSize.sm, textAlign: 'center' },
});
