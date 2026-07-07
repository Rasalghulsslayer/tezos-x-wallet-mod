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
import { setActiveAccount } from '@tezosx/wallet-core/use-cases/set-active-account';
import { peekCustomToken } from '@tezosx/wallet-core/use-cases/peek-custom-token';
import { addCustomToken } from '@tezosx/wallet-core/use-cases/add-custom-token';
import { removeCustomToken } from '@tezosx/wallet-core/use-cases/remove-custom-token';
import { sendTransfer as sendTransferUseCase, type SendTransferReq, type SendTransferResult } from '@tezosx/wallet-core/use-cases/send-transfer';
import { resolveTx as resolveTxUseCase, type ResolveTxResult } from '@tezosx/wallet-core/use-cases/resolve-tx';
import { lockVault } from '@tezosx/wallet-core/use-cases/lock-vault';
import { getState } from '@tezosx/wallet-core/use-cases/get-state';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import type { Container } from '@tezosx/wallet-core/ports/container';
import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import { keyring, tokenStore, unlockSecret, evmAliasCache, deps } from '../composition/wiring';
import { readState } from '../composition/read-state';
import { startWalletConnect } from '../composition/walletconnect-connect';

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
  evmAliasCache.value = null;
  void deps.rebuildContainer(); // keyring is now locked → drops the warm container
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
