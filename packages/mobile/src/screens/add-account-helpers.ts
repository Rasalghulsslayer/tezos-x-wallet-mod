/**
 * Pure helpers behind the AddAccount wizard: live shape validation for pasted
 * secrets, the client-side derivation used for duplicate detection and the
 * confirm-screen address preview, and the AddAccountSource mapping handed to
 * the keyring. Free of React and React Native so the logic runs (and is
 * tested) under plain node.
 */

import type { AccountKind, AddAccountSource } from '@tezosx/wallet-core/domain/account';
import type { AddAccountSourceKind } from '@tezosx/wallet-core/view-models/add-account-flow-vm';
import { EVM_PRIVKEY_RE, isValidEdsk, isValidMnemonic } from '@tezosx/wallet-core/domain/validation';
import { deriveTezosIdentity, deriveTezosIdentityFromSecretKey } from '@tezosx/wallet-core/shared/seed';
import { deriveEvmAccount, normaliseEvmPrivateKey } from '@tezosx/wallet-core/shared/evm-signing';

export type TzMode = 'mnemonic' | 'edsk';

/**
 * Cheap synchronous shape check driving the live meta line and the Continue
 * gate. The keyring lowercases a mnemonic before validating, so the check
 * lowercases too; edsk is case-sensitive base58 and is checked as-is.
 */
export function importShapeValid(kind: AccountKind, tzMode: TzMode, raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  if (kind === 'tezos') {
    return tzMode === 'mnemonic' ? isValidMnemonic(trimmed.toLowerCase()) : isValidEdsk(trimmed);
  }
  return EVM_PRIVKEY_RE.test(trimmed);
}

/** Word count of a pasted phrase (whitespace-tolerant), for the meta line. */
export function importWordCount(raw: string): number {
  return raw.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Derive the primary address a pasted secret resolves to (tz1, or the
 * checksum-cased 0x for an EVM key) — the input to duplicate detection.
 * Returns null while the shape is not yet valid; throws when the secret has a
 * plausible shape but cannot be used (e.g. an out-of-range EVM key), so the
 * caller can surface the parse error.
 */
export async function derivePrimaryFromImport(
  kind: AccountKind,
  tzMode: TzMode,
  raw: string,
): Promise<string | null> {
  if (!importShapeValid(kind, tzMode, raw)) return null;
  const trimmed = raw.trim();
  if (kind === 'tezos') {
    return tzMode === 'mnemonic'
      ? (await deriveTezosIdentity(trimmed.toLowerCase())).tz1
      : (await deriveTezosIdentityFromSecretKey(trimmed)).tz1;
  }
  return deriveEvmAccount(normaliseEvmPrivateKey(trimmed)).address;
}

/**
 * Primary address shown on the confirm screen. Derived accounts return null:
 * the wallet seed never leaves the keyring, so the next index's address cannot
 * be previewed client-side — the confirm screen explains the derivation
 * instead.
 */
export async function derivePreviewPrimary(args: {
  kind:      AccountKind;
  source:    AddAccountSourceKind;
  tzMode:    TzMode;
  fresh:     string;
  importRaw: string;
}): Promise<string | null> {
  const { kind, source, tzMode, fresh, importRaw } = args;
  if (source === 'derived') return null;
  if (source === 'import') return derivePrimaryFromImport(kind, tzMode, importRaw);
  return kind === 'tezos'
    ? (await deriveTezosIdentity(fresh)).tz1
    : deriveEvmAccount(fresh).address;
}

/**
 * Find an existing account whose primary address matches a derived one.
 * Structural on {tz1?, address?} so it accepts the shell's ViewAccount list
 * without importing UI types here.
 */
export function findDuplicate<T extends { tz1?: string; address?: string }>(
  accounts: readonly T[],
  derivedPrimary: string,
): T | null {
  const target = derivedPrimary.toLowerCase();
  return accounts.find((a) => (a.tz1 ?? a.address ?? '').toLowerCase() === target) ?? null;
}

/**
 * Map the wizard state to the AddAccountSource the keyring persists. The
 * secret the user revealed and acknowledged (fresh) or pasted (import) is the
 * one submitted — never source:'fresh', which would mint a different key than
 * the one the user just backed up.
 */
export function buildAddAccountSource(args: {
  kind:      AccountKind;
  source:    AddAccountSourceKind;
  tzMode:    TzMode;
  fresh:     string;
  importRaw: string;
}): AddAccountSource {
  const { kind, source, tzMode, fresh, importRaw } = args;
  if (source === 'derived') return { source: 'derived' };
  if (source === 'fresh') {
    return kind === 'tezos'
      ? { source: 'mnemonic', mnemonic: fresh }
      : { source: 'privkey', privateKey: fresh };
  }
  const trimmed = importRaw.trim();
  if (kind === 'evm') return { source: 'privkey', privateKey: normaliseEvmPrivateKey(trimmed) };
  return tzMode === 'edsk'
    ? { source: 'edsk', edsk: trimmed }
    : { source: 'mnemonic', mnemonic: trimmed.toLowerCase() };
}
