/**
 * Contacts — the wallet-global address book. An add-contact form (name +
 * address, validated by the core use-case) sits above the saved entries; each
 * row shows the label, the truncated address, and the runtime accent for where
 * the address lives. Tapping a row opens the rename sheet; the trailing trash
 * asks for confirmation before removing. Saved contacts surface as recipient
 * suggestions in Send.
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Contact } from '@tezosx/wallet-core/domain/contact';
import { formatError, type FormattedError } from '@tezosx/wallet-core/domain/error';
import { MAX_LABEL_LENGTH } from '@tezosx/wallet-core/shared/constants';
import { colors, font, fontSize, radius, space } from '../theme';
import { detectRuntime } from '@tezosx/wallet-core/domain/validation';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Icon } from '../ui/icon';
import { Btn } from '../ui/tx/Btn';
import { EmptyState } from '../ui/tx/EmptyState';
import { ErrorInline } from '../ui/tx/ErrorInline';
import { IconBtn } from '../ui/tx/IconBtn';
import { Sheet } from '../ui/tx/Sheet';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';

export function Contacts(): React.JSX.Element {
  const ctx = useWallet();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FormattedError | null>(null);
  const [renameTarget, setRenameTarget] = useState<Contact | null>(null);

  const addrRuntime = detectRuntime(address);
  const canSave = name.trim() !== '' && addrRuntime != null;

  const save = (): void => {
    if (busy || !canSave) return;
    setBusy(true);
    setErr(null);
    void (async () => {
      try {
        await ctx.addContact(address, name);
        setName('');
        setAddress('');
        ctx.toast('Contact saved');
      } catch (e) {
        setErr(formatError(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  const confirmRemove = (contact: Contact): void => {
    Alert.alert(`Remove ${contact.label}?`, 'Only the saved name is removed — the address itself is unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await ctx.removeContact(contact.address);
              ctx.toast('Contact removed');
            } catch (e) {
              ctx.toast(formatError(e).title);
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <TopBar title="Contacts" onBack={() => ctx.nav.back()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>Add contact</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={(v) => { setName(v); setErr(null); }}
          placeholder="Name"
          placeholderTextColor={colors.fgSubtle}
          maxLength={MAX_LABEL_LENGTH}
          autoCorrect={false}
        />
        <TextInput
          style={[
            styles.addrInput,
            address !== '' &&
              (addrRuntime == null ? styles.addrInvalid : addrRuntime === 'l2' ? styles.addrValidEvm : styles.addrValidMichelson),
          ]}
          value={address}
          onChangeText={(v) => { setAddress(v); setErr(null); }}
          placeholder="tz1… or 0x…"
          placeholderTextColor={colors.fgSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        {err != null && <ErrorInline title={err.title} detail={err.detail} />}
        <Btn variant="accent" full loading={busy} disabled={!canSave} onPress={save} style={styles.saveBtn}>
          Save contact
        </Btn>

        {ctx.contacts.length === 0 ? (
          <EmptyState
            icon={<Icon name="list" size={22} color={colors.fgMuted} />}
            title="No contacts yet"
            detail="Save an address with a name and it will be suggested whenever you send."
          />
        ) : (
          <>
            <Text style={[styles.kicker, styles.listKicker]}>Saved</Text>
            {ctx.contacts.map((c) => (
              <ContactRow key={c.address} contact={c} onRename={() => setRenameTarget(c)} onRemove={() => confirmRemove(c)} />
            ))}
          </>
        )}
      </ScrollView>

      {renameTarget != null && <RenameSheet contact={renameTarget} onClose={() => setRenameTarget(null)} />}
    </View>
  );
}

function ContactRow({
  contact,
  onRename,
  onRemove,
}: {
  contact: Contact;
  onRename: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  // Contact addresses are validated on save, so the runtime always resolves;
  // the Michelson fallback only guards a hand-edited store.
  const runtime = detectRuntime(contact.address) ?? 'l1';
  const isEvm = runtime === 'l2';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Rename ${contact.label}`}
      onPress={onRename}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.mark, isEvm ? styles.markEvm : styles.markMichelson]}>
        <Text style={[styles.markText, isEvm ? styles.markTextEvm : styles.markTextMichelson]}>
          {contact.label.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {contact.label}
        </Text>
        <Text style={styles.rowAddr} numberOfLines={1}>
          {shortAddr(contact.address, 8)}
        </Text>
      </View>
      <IconBtn name="trash" label={`Remove ${contact.label}`} size={17} onPress={onRemove} />
    </Pressable>
  );
}

function RenameSheet({ contact, onClose }: { contact: Contact; onClose: () => void }): React.JSX.Element {
  const ctx = useWallet();
  const [label, setLabel] = useState(contact.label);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FormattedError | null>(null);
  const canSave = label.trim() !== '' && label.trim() !== contact.label;

  const submit = (): void => {
    if (busy || !canSave) return;
    setBusy(true);
    setErr(null);
    void (async () => {
      try {
        await ctx.renameContact(contact.address, label);
        ctx.toast('Contact renamed');
        onClose();
      } catch (e) {
        setErr(formatError(e));
        setBusy(false);
      }
    })();
  };

  return (
    <Sheet title="Rename contact" onClose={onClose}>
      <View style={styles.renameBody}>
        <Text style={styles.renameAddr}>{shortAddr(contact.address, 10)}</Text>
        <TextInput
          style={styles.nameInput}
          value={label}
          autoFocus
          onChangeText={(v) => { setLabel(v); setErr(null); }}
          placeholder="Name"
          placeholderTextColor={colors.fgSubtle}
          maxLength={MAX_LABEL_LENGTH}
          autoCorrect={false}
        />
        {err != null && <ErrorInline title={err.title} detail={err.detail} />}
        <Btn variant="accent" full loading={busy} disabled={!canSave} onPress={submit} style={styles.saveBtn}>
          Save
        </Btn>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  body: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 24 },

  kicker: {
    fontSize: 11,
    letterSpacing: 0.99,
    textTransform: 'uppercase',
    color: colors.fgSubtle,
    fontWeight: '600',
    paddingTop: 10,
    paddingBottom: 8,
  },
  listKicker: { paddingTop: 22 },

  nameInput: {
    width: '100%',
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.md,
    height: 52,
    paddingHorizontal: 16,
  },
  addrInput: {
    width: '100%',
    marginTop: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    color: colors.fg,
    fontSize: fontSize.sm,
    height: 52,
    paddingHorizontal: 16,
    letterSpacing: -0.1,
    fontFamily: font.mono,
  },
  addrValidMichelson: { borderColor: colors.purpleLine },
  addrValidEvm: { borderColor: colors.cyanLine },
  addrInvalid: { borderColor: 'rgba(255,93,93,0.5)' },
  saveBtn: { marginTop: 14 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surface2 },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markMichelson: { backgroundColor: colors.purpleBg },
  markEvm: { backgroundColor: colors.cyanBg },
  markText: { fontSize: fontSize.md, fontWeight: '600' },
  markTextMichelson: { color: colors.purpleText },
  markTextEvm: { color: colors.cyanText },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  rowAddr: { fontSize: fontSize.xs, color: colors.fgMuted, fontFamily: font.mono, marginTop: 2 },

  renameBody: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 16, gap: space[1] },
  renameAddr: { fontSize: fontSize.xs, color: colors.fgMuted, fontFamily: font.mono, marginBottom: 8 },
});
