/** How long a copied secret lingers on the OS clipboard before being cleared. */
export const CLIPBOARD_CLEAR_MS = 30_000;

/**
 * Copy a secret to the clipboard and schedule it to be cleared after
 * CLIPBOARD_CLEAR_MS, so a revealed mnemonic / private key doesn't sit in the
 * OS clipboard (readable by any app, synced across devices) indefinitely. The
 * clear only fires if the clipboard still holds this exact value — so a thing
 * the user copied afterwards is never clobbered; if the contents can't be read
 * back (permission/focus), it clears anyway, matching common wallet behaviour.
 */
export function copySecretWithAutoClear(value: string): void {
  void navigator.clipboard.writeText(value);
  setTimeout(() => {
    void navigator.clipboard.readText()
      .then((current) => { if (current === value) return navigator.clipboard.writeText(''); })
      .catch(() => navigator.clipboard.writeText('').catch(() => {}));
  }, CLIPBOARD_CLEAR_MS);
}
