/**
 * vault-actions — the real vault lifecycle sequences the WalletProvider calls.
 * Each drives the live composition (keyring + unlock secret + container +
 * WalletConnect) via the shared core use-cases and returns the resulting
 * VaultState, so the provider is a thin host that just sets React state. Pure of
 * React — unit-testable against a mock keyring/unlockSecret.
 */

import { unlockVault } from '@tezosx/wallet-core/use-cases/unlock-vault';
import { createAccount } from '@tezosx/wallet-core/use-cases/create-account';
import { importAccount, type ImportAccountReq } from '@tezosx/wallet-core/use-cases/import-account';
import { addAccount as addAccountUseCase, type AddAccountReq, type AddAccountResult } from '@tezosx/wallet-core/use-cases/add-account';
import { removeAccount as removeAccountUseCase } from '@tezosx/wallet-core/use-cases/remove-account';
import { setActiveAccount } from '@tezosx/wallet-core/use-cases/set-active-account';
import { peekCustomToken } from '@tezosx/wallet-core/use-cases/peek-custom-token';
import { addCustomToken } from '@tezosx/wallet-core/use-cases/add-custom-token';
import { removeCustomToken } from '@tezosx/wallet-core/use-cases/remove-custom-token';
import { listContacts as listContactsUseCase } from '@tezosx/wallet-core/use-cases/list-contacts';
import { addContact as addContactUseCase } from '@tezosx/wallet-core/use-cases/add-contact';
import { renameContact as renameContactUseCase } from '@tezosx/wallet-core/use-cases/rename-contact';
import { removeContact as removeContactUseCase } from '@tezosx/wallet-core/use-cases/remove-contact';
import { sendTransfer as sendTransferUseCase, type SendTransferReq, type SendTransferResult } from '@tezosx/wallet-core/use-cases/send-transfer';
import { resolveTx as resolveTxUseCase, type ResolveTxResult } from '@tezosx/wallet-core/use-cases/resolve-tx';
import { listSessions as listStoredSessions } from '@tezosx/wallet-core/use-cases/list-sessions';
import { disconnectOrigin } from '@tezosx/wallet-core/use-cases/disconnect-origin';
import { lockVault } from '@tezosx/wallet-core/use-cases/lock-vault';
import { changePassword as changePasswordUseCase } from '@tezosx/wallet-core/use-cases/change-password';
import { resetWallet as resetWalletUseCase } from '@tezosx/wallet-core/use-cases/reset-wallet';
import { getState } from '@tezosx/wallet-core/use-cases/get-state';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import type { Contact } from '@tezosx/wallet-core/domain/contact';
import type { StoredSession } from '@tezosx/wallet-core/ports/session-store';
import type { Container } from '@tezosx/wallet-core/ports/container';
import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import { keyring, tokenStore, unlockSecret, evmAliasCache, deps, approvalQueue, sessionStore } from '../composition/wiring';
import { approvalUi } from '../composition/approval-ui';
import { readState } from '../composition/read-state';
import { startWalletConnect, connect as wcConnect } from '../composition/walletconnect-connect';
import {
  listSessions as listWcSessions,
  disconnectSession as disconnectWcSession,
  subscribeSessions as subscribeWcSessions,
} from '../transport/walletconnect';

/** Network-free boot read: empty → onboarding, locked, or (rehydrated) unlocked. */
export function bootState(): Promise<VaultState> {
  return readState();
}

/** True when a password is sealed behind biometrics and the hardware is usable. */
export async function biometricsAvailable(): Promise<boolean> {
  return (await unlockSecret.hasSecret()) && (await unlockSecret.isBiometryAvailable());
}

/**
 * Shared tail once the keyring is unlocked (by unlock/create/import): seal the
 * password behind biometrics (best-effort), warm the active-account container,
 * boot WalletConnect, and resolve the full unlocked state (alias + summaries).
 */
async function afterUnlocked(password: string): Promise<VaultState> {
  await unlockSecret.seal(password).catch(() => { /* no biometry hardware → password-only */ });
  await deps.rebuildContainer();
  void startWalletConnect().catch(() => { /* WC boot is best-effort */ });
  return getState({ keyring, evmAliasCache });
}

export async function unlockWithPassword(password: string): Promise<VaultState> {
  await unlockVault({ password }, { keyring, tokenStore });
  return afterUnlocked(password);
}

/** Prompt biometrics for the sealed password, then unlock. null = cancelled/unavailable. */
export async function unlockWithBiometrics(): Promise<VaultState | null> {
  const password = await unlockSecret.retrieve('Unlock your wallet');
  if (password == null) return null;
  await unlockVault({ password }, { keyring, tokenStore });
  return afterUnlocked(password);
}

export async function createTezosWallet(mnemonic: string, password: string): Promise<VaultState> {
  await createAccount({ mnemonic, password }, { keyring });
  return afterUnlocked(password);
}

export async function importWallet(req: ImportAccountReq): Promise<VaultState> {
  await importAccount(req, { keyring });
  return afterUnlocked(req.password);
}

export function lockWallet(): void {
  lockVault({ keyring, approvalQueue: deps.approvalQueue });
  // Mobile has one long-lived JS thread — no MV3 service-worker death ever
  // evicts these for us. The cached Containers hold live signers with
  // plaintext key material (and Taquito's InMemorySigner keeps its own
  // internal copy), so lock must drop every reference synchronously, exactly
  // as the extension's LOCK handler does: the cache, the warm active
  // container, and the alias caches. Scheduling the drop (a rebuild) instead
  // would leave a window where a caller can still reach the dead container
  // after lock returns. JS strings can't be zeroized, so unreachability —
  // then GC — is the strongest guarantee available here.
  deps.containerCache.clear();
  deps.state.container = null;
  deps.state.evmAlias  = null;
  evmAliasCache.value  = null;
}

/**
 * Change the vault password, then re-seal the Keychain unlock secret with the
 * new one. Ordering matters: once the keyring re-seal succeeds the vault only
 * opens with the new password, so the biometric copy must be replaced — the
 * keystore would otherwise keep releasing the old password and every biometric
 * unlock would silently fail against the re-sealed vault. If sealing the new
 * password fails (no enrolment, keystore refusal), the sealed copy is cleared
 * instead so biometrics degrade to manual password entry rather than replaying
 * a dead password. Neither Keychain outcome fails the operation: the vault
 * change has already happened and must not be reported as an error.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await changePasswordUseCase({ currentPassword, newPassword }, { keyring });
  try {
    await unlockSecret.seal(newPassword);
  } catch {
    await unlockSecret.clear().catch(() => { /* biometric unlock is already unusable; password entry remains */ });
  }
}

/**
 * Forgot-password recovery: destroy the vault so the user can re-import from
 * their seed phrase. The core use-case wipes the sealed vault + unlock
 * throttle and clears dApp sessions and token registries (the address book is
 * deliberately kept). The mobile extras go with it: pending approvals are
 * flushed, every in-memory container reference is dropped synchronously (the
 * same block lockWallet runs, for the same reason), and the Keychain-sealed
 * unlock password is removed — it must not survive the vault it opened.
 */
export async function resetWallet(): Promise<void> {
  await resetWalletUseCase({ keyring, sessionStore, tokenStore });
  deps.approvalQueue.rejectAll('wallet reset');
  deps.containerCache.clear();
  deps.state.container = null;
  deps.state.evmAlias  = null;
  evmAliasCache.value  = null;
  await unlockSecret.clear();
}

export interface AddAccountOutcome {
  state: VaultState;
  result: AddAccountResult;
}

/**
 * Add an account to the already-unlocked vault, then make it active. Mirrors the
 * extension's ADD_ACCOUNT → SET_ACTIVE_ACCOUNT sequencing: the use-case does not
 * auto-activate, so we set-active, drop the cached alias (it must re-resolve for
 * the new account), warm its container, and return the refreshed state. The
 * caller reveals `result.secret` for a freshly generated account.
 */
export async function addAccount(req: AddAccountReq): Promise<AddAccountOutcome> {
  const result = await addAccountUseCase(req, { keyring, tokenStore });
  await setActiveAccount({ accountId: result.accountId }, { keyring });
  evmAliasCache.value = null;
  const state = await getState({ keyring, evmAliasCache });
  // Warm the new account's container in the background — creation must not block
  // (or fail) on it; read/send paths rebuild it lazily when needed.
  void deps.rebuildContainer().catch(() => { /* rebuilt lazily on next read/send */ });
  return { state, result };
}

/**
 * Remove an account from the unlocked vault; the keyring re-verifies the
 * password and refuses to drop the last account. Account operations don't go
 * through a message dispatch on mobile, so the shell reproduces what the
 * extension's handler does around the use-case: evict the account's cached
 * container, tear down the dApp connections that were bound to the removed
 * account (each dApp learns via WalletConnect's session_delete), and — when the
 * active account was the one removed — re-scope to the auto-selected
 * replacement. dApps connected with *other* accounts are untouched: a removal
 * must not disclose or re-point another origin's account.
 */
export async function removeAccount(accountId: string, password: string): Promise<VaultState> {
  const wasActive = activeAccountId() === accountId;
  // Capture the sessions bound to this account before it's gone.
  const orphaned = (await sessionStore.list()).filter((s) => s.accountId === accountId);
  await removeAccountUseCase({ accountId, password }, { keyring });
  deps.containerCache.evict(accountId);
  await Promise.all(orphaned.map((s) => disconnectDapp(s.origin).catch(() => { /* best-effort */ })));
  if (wasActive) {
    evmAliasCache.value = null;
    await deps.rebuildContainer();
  }
  return getState({ keyring, evmAliasCache });
}

function activeAccountId(): string {
  const unlocked = keyring.getUnlocked();
  if (unlocked == null) throw new Error('Wallet is locked');
  return unlocked.account.id;
}

/** Read-only ERC-20 metadata preview for the confirm step — does not persist. */
export function peekToken(address: string, tryAnyway = false): Promise<RegisteredToken> {
  return peekCustomToken({ accountId: activeAccountId(), address, tryAnyway }, { tokenStore, rpcUrl: TEZLINK_EVM_RPC });
}

/** Register an ERC-20 for the active account, then rebuild so the fetchers pick it up. */
export async function addToken(address: string, tryAnyway = false): Promise<RegisteredToken> {
  const token = await addCustomToken({ accountId: activeAccountId(), address, tryAnyway }, { tokenStore, rpcUrl: TEZLINK_EVM_RPC });
  await deps.rebuildContainer();
  return token;
}

export async function removeToken(address: string): Promise<void> {
  await removeCustomToken({ accountId: activeAccountId(), address }, { tokenStore });
  await deps.rebuildContainer();
}

/** The wallet-global address book, label-sorted. */
export function loadContacts(): Promise<Contact[]> {
  return listContactsUseCase({ contactStore: deps.persistentPorts.contactStore });
}

/** Save a new address-book entry (validated + deduped + capped by the use-case). */
export function addContact(address: string, label: string): Promise<Contact> {
  return addContactUseCase({ address, label }, { contactStore: deps.persistentPorts.contactStore });
}

/** Relabel an existing entry — the address is its identity and never changes. */
export function renameContact(address: string, label: string): Promise<Contact> {
  return renameContactUseCase({ address, label }, { contactStore: deps.persistentPorts.contactStore });
}

/** Drop an entry from the address book (idempotent). */
export function removeContact(address: string): Promise<void> {
  return removeContactUseCase({ address }, { contactStore: deps.persistentPorts.contactStore });
}

/**
 * Per-signature biometric presence check. No-ops (returns true) on a
 * password-only device — nothing is sealed to confirm against, so it must not
 * block signing — and fails closed (false) when biometrics are set but the OS
 * prompt is cancelled / the enrolment changed.
 */
export async function confirmSignature(promptTitle = 'Confirm transfer'): Promise<boolean> {
  if (!(await biometricsAvailable())) return true;
  return unlockSecret.confirmBiometric(promptTitle);
}

/** A guaranteed-warm Container for the active account. rebuildContainer is a
 *  cache hit when already warm, and covers the add-account background-warm gap. */
async function warmContainer(): Promise<Container> {
  if (keyring.getUnlocked() == null) throw new Error('Wallet is locked');
  await deps.rebuildContainer();
  const container = deps.state.container;
  if (container == null) throw new Error('Wallet is locked');
  return container;
}

/** Broadcast a transfer, gated behind a biometric confirm. Returns immediately
 *  with { runtime, hash } — a tz1 → 0x result is a synthetic hash to resolveTx. */
export async function sendTransfer(req: SendTransferReq): Promise<SendTransferResult> {
  const container = await warmContainer();
  if (!(await confirmSignature('Confirm transfer'))) throw new Error('Biometric confirmation cancelled');
  return sendTransferUseCase(req, { container });
}

/** One resolution attempt of a synthetic NAC hash to the real EVM hash. */
export function resolveTx(syntheticHash: string): Promise<ResolveTxResult> {
  const container = deps.state.container;
  if (container == null) throw new Error('Wallet is locked');
  return resolveTxUseCase({ syntheticHash }, { container });
}

// ── dApp approvals + WalletConnect sessions ───────────────────────────────────

/**
 * Resolve the pending dApp approval (the one the presenter surfaced via
 * approvalUi). An approve is gated behind the per-signature biometric confirm
 * (returns false, leaving the request pending, when the user cancels); a reject
 * resolves immediately. Returns whether the decision was delivered.
 */
export async function resolveApproval(decision: 'approve' | 'reject'): Promise<boolean> {
  const requestId = approvalUi.get();
  if (requestId == null) return false;
  if (decision === 'approve') {
    const req = approvalQueue.get(requestId);
    const title = req?.kind === 'signature' ? 'Sign message' : req?.kind === 'transaction' ? 'Confirm transaction' : 'Connect dApp';
    if (!(await confirmSignature(title))) return false;
  }
  approvalQueue.resolve(requestId, decision);
  return true;
}

/** Pair with a dApp from a pasted `wc:` URI; the proposal then drives the modal. */
export function connectDapp(uri: string): Promise<void> {
  return wcConnect(uri);
}

/** The persisted per-origin dApp sessions (the Connections list source). */
export function loadSessions(): Promise<StoredSession[]> {
  return listStoredSessions({ sessionStore });
}

/** Live WC session changes (approve / disconnect / dApp-side revoke). */
export function subscribeSessions(listener: () => void): () => void {
  return subscribeWcSessions(listener);
}

/** Revoke a dApp: tear down the live WC session AND drop the stored per-origin entry. */
export async function disconnectDapp(origin: string): Promise<void> {
  const topic = listWcSessions().find((s) => s.url === origin)?.topic;
  if (topic != null) await disconnectWcSession(topic);
  await disconnectOrigin({ origin }, { sessionStore });
}
