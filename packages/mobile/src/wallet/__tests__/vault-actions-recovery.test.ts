/**
 * changePassword / resetWallet orchestration — the mobile shell keeps a second
 * copy of the vault password sealed in the Keychain behind biometrics, so the
 * core operations need platform sequencing around them:
 *
 * - changePassword must re-seal the Keychain copy with the NEW password after
 *   the keyring re-seal — otherwise the keystore keeps releasing the old
 *   password and biometric unlock silently breaks against the re-sealed vault.
 *   If sealing fails, the copy is cleared so biometrics degrade to password
 *   entry instead of replaying a dead password, and the operation still
 *   resolves (the vault change already happened).
 * - resetWallet must clear the Keychain copy (the sealed old password must not
 *   survive the vault it opened) and drop every in-memory container reference,
 *   exactly as lockWallet does.
 *
 * The keyring/vault crypto rules are covered by the core suites; these tests
 * pin the shell sequencing only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '@tezosx/wallet-core/ports/container';

const h = vi.hoisted(() => {
  const keyring = {
    changePassword: vi.fn(async () => {}),
    wipe: vi.fn(async () => {}),
    lock: vi.fn(),
    getUnlocked: vi.fn(),
  };
  const unlockSecret = {
    seal: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  };
  const sessionStore = { clear: vi.fn(async () => {}), list: vi.fn(async () => []) };
  const tokenStore   = { clear: vi.fn(async () => {}) };
  const deps = {
    keyring,
    approvalQueue: { rejectAll: vi.fn() },
    containerCache: { clear: vi.fn(), evict: vi.fn() },
    rebuildContainer: vi.fn(async () => {}),
    broadcastEvent: vi.fn(async () => {}),
    state: { container: null as Container | null, evmAlias: null as string | null },
    persistentPorts: {},
  };
  return {
    keyring, unlockSecret, sessionStore, tokenStore, deps,
    evmAliasCache: { value: null as string | null },
  };
});

vi.mock('../../composition/wiring', () => ({
  keyring: h.keyring,
  tokenStore: h.tokenStore,
  unlockSecret: h.unlockSecret,
  evmAliasCache: h.evmAliasCache,
  deps: h.deps,
  approvalQueue: h.deps.approvalQueue,
  sessionStore: h.sessionStore,
}));
vi.mock('../../composition/approval-ui', () => ({
  approvalUi: { get: () => null, subscribe: () => () => {} },
}));
vi.mock('../../composition/read-state', () => ({ readState: vi.fn() }));
vi.mock('../../composition/walletconnect-connect', () => ({
  startWalletConnect: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('../../transport/walletconnect', () => ({
  listSessions: () => [],
  disconnectSession: vi.fn(),
  subscribeSessions: () => () => {},
}));

import { changePassword, resetWallet } from '../vault-actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('changePassword — biometrics after a password change', () => {
  it('re-seals the Keychain with the NEW password, after the keyring re-seal', async () => {
    await changePassword('old-password', 'new-password-1');

    expect(h.keyring.changePassword).toHaveBeenCalledWith('old-password', 'new-password-1');
    expect(h.unlockSecret.seal).toHaveBeenCalledTimes(1);
    expect(h.unlockSecret.seal).toHaveBeenCalledWith('new-password-1');
    // The Keychain copy is replaced only once the vault re-seal succeeded —
    // sealing first would store a password the vault might never accept.
    const keyringCall = h.keyring.changePassword.mock.invocationCallOrder[0];
    const sealCall    = h.unlockSecret.seal.mock.invocationCallOrder[0];
    expect(sealCall).toBeGreaterThan(keyringCall);
    expect(h.unlockSecret.clear).not.toHaveBeenCalled();
  });

  it('keyring rejection (wrong current password) propagates and leaves the Keychain untouched', async () => {
    h.keyring.changePassword.mockRejectedValueOnce(new Error('Incorrect password'));

    await expect(changePassword('bad', 'new-password-1')).rejects.toThrow('Incorrect password');
    expect(h.unlockSecret.seal).not.toHaveBeenCalled();
    expect(h.unlockSecret.clear).not.toHaveBeenCalled();
  });

  it('seal failure degrades to clear — and the operation still resolves', async () => {
    h.unlockSecret.seal.mockRejectedValueOnce(new Error('keystore refused'));

    // The vault is already re-sealed at this point: a Keychain failure must
    // not surface as a failed password change. Clearing means biometrics fall
    // back to password entry instead of replaying the dead old password.
    await expect(changePassword('old-password', 'new-password-1')).resolves.toBeUndefined();
    expect(h.unlockSecret.clear).toHaveBeenCalledTimes(1);
  });

  it('resolves even when the fallback clear itself fails', async () => {
    h.unlockSecret.seal.mockRejectedValueOnce(new Error('keystore refused'));
    h.unlockSecret.clear.mockRejectedValueOnce(new Error('keychain unavailable'));

    await expect(changePassword('old-password', 'new-password-1')).resolves.toBeUndefined();
  });
});

describe('resetWallet — the forgot-password recovery path', () => {
  beforeEach(() => {
    h.deps.state.container = { signer: {} } as unknown as Container;
    h.deps.state.evmAlias  = '0xSomeAlias';
    h.evmAliasCache.value  = '0xSomeAlias';
  });

  it('wipes the keyring and clears sessions + token registries', async () => {
    await resetWallet();

    expect(h.keyring.wipe).toHaveBeenCalledTimes(1);
    expect(h.sessionStore.clear).toHaveBeenCalledTimes(1);
    expect(h.tokenStore.clear).toHaveBeenCalledTimes(1);
  });

  it('removes the Keychain-sealed password — it must not survive the vault it opened', async () => {
    await resetWallet();

    expect(h.unlockSecret.clear).toHaveBeenCalledTimes(1);
  });

  it('drops every in-memory container reference, like lockWallet', async () => {
    await resetWallet();

    expect(h.deps.containerCache.clear).toHaveBeenCalledTimes(1);
    expect(h.deps.state.container).toBeNull();
    expect(h.deps.state.evmAlias).toBeNull();
    expect(h.evmAliasCache.value).toBeNull();
    expect(h.deps.approvalQueue.rejectAll).toHaveBeenCalledTimes(1);
  });

  it('a wipe failure propagates before anything platform-side is touched', async () => {
    h.keyring.wipe.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(resetWallet()).rejects.toThrow('storage unavailable');
    expect(h.unlockSecret.clear).not.toHaveBeenCalled();
    expect(h.deps.containerCache.clear).not.toHaveBeenCalled();
  });
});
