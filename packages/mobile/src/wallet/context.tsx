/**
 * WalletContext — the app's composition root behind the single seam every screen
 * consumes via useWallet(). It owns the real VaultState (boot via readState,
 * transitions via the keyring use-cases in vault-actions), derives the active
 * account + summaries as ViewAccounts, wires auto-lock, and exposes navigation +
 * overlay state. Screens/components stay pure presentation: they read this
 * context and call its actions; all keyring/container I/O lives below the seam.
 *
 * dApp sessions run on the live WalletConnect transport: connect/disconnect,
 * the session list, and approval resolution all route through the shared core
 * dispatch; balances / tokens / activity run on the live fetchers.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { VaultState, VaultStateUnlocked, PendingRequest } from '@tezosx/wallet-core/shared/messages';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import { accountCardVM, type AccountCardVM } from '@tezosx/wallet-core/view-models/account-card-vm';
import { getState } from '@tezosx/wallet-core/use-cases/get-state';
import type { ImportAccountReq } from '@tezosx/wallet-core/use-cases/import-account';
import type { AddAccountReq, AddAccountResult } from '@tezosx/wallet-core/use-cases/add-account';
import type { SendTransferReq, SendTransferResult } from '@tezosx/wallet-core/use-cases/send-transfer';
import type { ResolveTxResult } from '@tezosx/wallet-core/use-cases/resolve-tx';
import type { StoredSession } from '@tezosx/wallet-core/ports/session-store';
import { keyring, evmAliasCache, deps, approvalQueue } from '../composition/wiring';
import { approvalUi } from '../composition/approval-ui';
import { startAutoLock, type AutoLockHandle } from '../lock/auto-lock';
import * as vaultActions from './vault-actions';
import { useAccountData, type AsyncData, type BalancesView, type ActivityView } from './use-account-data';
import { activeToView, summaryToView, type ViewAccount } from './view-account';

export type VaultView = 'onboarding' | 'locked' | 'unlocked';
export type TabId = 'home' | 'activity' | 'connections' | 'settings';
export type StackName =
  | 'send' | 'receive' | 'addAccount' | 'addToken' | 'tokens'
  | 'welcome' | 'create' | 'import';

export interface StackEntry { name: StackName; params: Record<string, unknown>; }

export interface WalletNav {
  tab: TabId;
  push: (name: StackName, params?: Record<string, unknown>) => void;
  back: () => void;
  goTab: (id: TabId) => void;
  reset: (name: 'home') => void;
}

export interface WalletContextValue {
  booted: boolean;
  vault: VaultView;
  biometricsAvailable: boolean;
  accounts: ViewAccount[];
  activeAccount: ViewAccount;
  accountCard: AccountCardVM | null;
  activeId: string;
  hasSeed: boolean;
  sessions: StoredSession[];
  approve: PendingRequest | null;
  switcherOpen: boolean;
  toastMsg: string | null;
  stack: StackEntry[];
  navDir: 'fwd' | 'back';
  nav: WalletNav;

  balances: AsyncData<BalancesView>;
  tokens: AsyncData<RegisteredToken[]>;
  activity: AsyncData<ActivityView>;
  refreshData: () => void;
  labelFor: (a: ViewAccount | undefined) => string;

  toast: (msg: string) => void;
  copy: (addr: string) => void;
  touch: () => void;
  setActive: (id: string) => void;
  lock: () => void;
  unlock: (password: string) => Promise<void>;
  unlockBiometric: () => Promise<boolean>;
  createTezosWallet: (mnemonic: string, password: string) => Promise<void>;
  importWallet: (req: ImportAccountReq) => Promise<void>;
  resetToWelcome: () => void;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  disconnect: (origin: string) => void;
  connect: (uri: string) => Promise<void>;
  resolveApproval: (decision: 'approve' | 'reject') => Promise<boolean>;
  peekToken: (address: string, tryAnyway?: boolean) => Promise<RegisteredToken>;
  addToken: (address: string, tryAnyway?: boolean) => Promise<RegisteredToken>;
  removeToken: (address: string) => Promise<void>;
  addAccount: (req: AddAccountReq) => Promise<AddAccountResult>;
  removeAccount: (id: string, password: string) => Promise<void>;
  sendTransfer: (req: SendTransferReq) => Promise<SendTransferResult>;
  resolveTx: (syntheticHash: string) => Promise<ResolveTxResult>;
}

const EMPTY_ACCOUNT: ViewAccount = { id: '', kind: 'tezos', label: '', createdAt: 0, tz1: '', evmAlias: '', identitySeed: '' };

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (ctx == null) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [booted, setBooted] = useState(false);
  const [vaultState, setVaultState] = useState<VaultState>({ status: 'empty' });
  const [onboardingOverride, setOnboardingOverride] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  const [tab, setTab] = useState<TabId>('home');
  const [stack, setStack] = useState<StackEntry[]>([]);
  const [navDir, setNavDir] = useState<'fwd' | 'back'>('fwd');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLock = useRef<AutoLockHandle | null>(null);

  const activeState: VaultStateUnlocked | null = vaultState.status === 'unlocked' ? vaultState : null;
  const vault: VaultView = onboardingOverride || vaultState.status === 'empty'
    ? 'onboarding'
    : vaultState.status === 'locked' ? 'locked' : 'unlocked';

  const [dataNonce, setDataNonce] = useState(0);

  const accounts = useMemo(() => (activeState != null ? activeState.accounts.map(summaryToView) : []), [activeState]);
  const activeAccount = activeState != null ? activeToView(activeState) : EMPTY_ACCOUNT;
  const accountCard = activeState != null ? accountCardVM(activeState) : null;
  const accountData = useAccountData(activeState, dataNonce);

  // Live dApp approval: the presenter writes the pending requestId to approvalUi;
  // resolve it to the full request off the queue.
  const approveId = useSyncExternalStore(approvalUi.subscribe, approvalUi.get);
  const approve = approveId != null ? approvalQueue.get(approveId) ?? null : null;

  const refresh = useCallback(async (): Promise<void> => {
    setVaultState(await getState({ keyring, evmAliasCache }));
  }, []);

  const reloadSessions = useCallback(async (): Promise<void> => {
    setSessions(await vaultActions.loadSessions());
  }, []);

  // Boot: instant network-free read, then (if unlocked) warm the container +
  // fill summaries/alias so the account-data effect has a live container.
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = await vaultActions.bootState();
      if (!live) return;
      setVaultState(s);
      setBioAvailable(await vaultActions.biometricsAvailable());
      if (s.status === 'unlocked') { await deps.rebuildContainer(); await refresh(); }
      if (live) setBooted(true);
    })();
    return () => { live = false; };
  }, [refresh]);

  const toast = useCallback((msg: string): void => {
    setToastMsg(msg);
    if (toastTimer.current != null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
  }, []);
  const copy = useCallback((_addr: string): void => toast('Address copied'), [toast]);

  const lock = useCallback((): void => {
    vaultActions.lockWallet();
    autoLock.current?.stop();
    autoLock.current = null;
    setStack([]); setSwitcherOpen(false);
    setVaultState({ status: 'locked' });
  }, []);

  // Arm auto-lock while unlocked; disarm otherwise.
  useEffect(() => {
    if (vault !== 'unlocked') return;
    autoLock.current = startAutoLock(() => lock());
    return () => { autoLock.current?.stop(); autoLock.current = null; };
  }, [vault, lock]);

  // Keep the dApp session list fresh while unlocked (WalletConnect changes).
  useEffect(() => {
    if (vault !== 'unlocked') { setSessions([]); return; }
    void reloadSessions();
    return vaultActions.subscribeSessions(() => { void reloadSessions(); });
  }, [vault, reloadSessions]);

  const labelFor = useCallback((a: ViewAccount | undefined): string => {
    if (a == null) return 'Account';
    if (a.label.trim() !== '') return a.label;
    const idx = accounts.findIndex((x) => x.id === a.id);
    return `Account ${idx >= 0 ? idx + 1 : 1}`;
  }, [accounts]);

  const nav = useMemo<WalletNav>(() => ({
    tab,
    push: (name, params = {}) => { setNavDir('fwd'); setStack((s) => [...s, { name, params }]); },
    back: () => { setNavDir('back'); setStack((s) => s.slice(0, -1)); },
    goTab: (id) => { setStack([]); setTab(id); },
    reset: () => { setStack([]); setTab('home'); },
  }), [tab]);

  const enterUnlocked = useCallback((s: VaultState): void => {
    setVaultState(s); setOnboardingOverride(false); setStack([]); setTab('home');
  }, []);

  const value = useMemo<WalletContextValue>(() => ({
    booted, vault, biometricsAvailable: bioAvailable,
    accounts, activeAccount, accountCard, activeId: activeState?.accountId ?? '',
    hasSeed: activeState?.hasSeed ?? false,
    sessions, approve, switcherOpen, toastMsg, stack, navDir, nav,
    balances: accountData.balances,
    tokens: accountData.tokens,
    activity: accountData.activity,
    refreshData: () => setDataNonce((n) => n + 1),
    labelFor, toast, copy,
    touch: () => autoLock.current?.touch(),
    setActive: (id) => {
      const s = activeState;
      if (s == null || id === s.accountId) return;
      const target = s.accounts.find((a) => a.id === id);
      if (target == null) return;
      // Instant switch: the account set is unchanged (only the active pointer
      // moves) and the target's EVM alias is already resolved in its summary, so
      // the UI re-scopes with zero network/crypto. The keyring's active pointer
      // flips synchronously in memory (a send stays bound to the right account);
      // the disk re-seal that persists it (a PBKDF2 re-encrypt — now cheap on the
      // native crypto port) is flushed off the tap in the background below, so the
      // selection survives a lock without the switch itself ever stalling.
      const alias = target.kind === 'tezos' ? (target.secondaryAddress ?? null) : target.primaryAddress;
      evmAliasCache.value = alias;
      keyring.activateInMemory(id);
      setVaultState(target.kind === 'tezos'
        ? { status: 'unlocked', kind: 'tezos', accountId: id, tz1: target.primaryAddress, evmAlias: target.secondaryAddress ?? '', accounts: s.accounts, hasSeed: s.hasSeed }
        // An EVM summary's primaryAddress is always a 0x address (the account's own).
        : { status: 'unlocked', kind: 'evm', accountId: id, address: target.primaryAddress as `0x${string}`, accounts: s.accounts, hasSeed: s.hasSeed });
      void (async () => {
        await deps.rebuildContainer();   // warm the container for reads (key derivation is negligible + cached per account)
        setDataNonce((n) => n + 1);      // re-run the reads (activity) now the container is warm
        // No dApp notification: switching the active account (for the user's own
        // Send/Receive) does not change what a connected dApp sees — each origin
        // stays bound to the account it connected with. Re-pointing every session
        // to the active account was the SEC-1 leak.
        await keyring.flushActive();     // persist the active pointer off the tap (cheap now crypto is native) so it survives a lock
      })();
    },
    lock,
    unlock: async (password) => { enterUnlocked(await vaultActions.unlockWithPassword(password)); await refresh(); },
    unlockBiometric: async () => {
      const s = await vaultActions.unlockWithBiometrics();
      if (s == null) return false;
      enterUnlocked(s); await refresh(); return true;
    },
    createTezosWallet: async (mnemonic, password) => { enterUnlocked(await vaultActions.createTezosWallet(mnemonic, password)); await refresh(); },
    importWallet: async (req) => { enterUnlocked(await vaultActions.importWallet(req)); await refresh(); },
    resetToWelcome: () => { setOnboardingOverride(true); setStack([]); },
    openSwitcher: () => setSwitcherOpen(true),
    closeSwitcher: () => setSwitcherOpen(false),
    connect: (uri) => vaultActions.connectDapp(uri),
    resolveApproval: (decision) => vaultActions.resolveApproval(decision),
    disconnect: (origin) => {
      void (async () => {
        try {
          await vaultActions.disconnectDapp(origin);
          await reloadSessions();
          toast('Disconnected');
        } catch {
          toast('Could not disconnect');
        }
      })();
    },
    peekToken: (address, tryAnyway) => vaultActions.peekToken(address, tryAnyway),
    addToken: async (address, tryAnyway) => {
      const token = await vaultActions.addToken(address, tryAnyway);
      setDataNonce((n) => n + 1);
      return token;
    },
    removeToken: async (address) => {
      await vaultActions.removeToken(address);
      setDataNonce((n) => n + 1);
    },
    addAccount: async (req) => {
      const { state, result } = await vaultActions.addAccount(req);
      setVaultState(state);
      return result;
    },
    removeAccount: async (id, password) => {
      const state = await vaultActions.removeAccount(id, password);
      setVaultState(state);
      setDataNonce((n) => n + 1);
      toast('Account removed');
    },
    sendTransfer: (req) => vaultActions.sendTransfer(req),
    resolveTx: (syntheticHash) => vaultActions.resolveTx(syntheticHash),
  }), [booted, vault, bioAvailable, accounts, activeAccount, accountCard, accountData, activeState, approve, sessions,
      switcherOpen, toastMsg, stack, navDir, nav, labelFor, toast, copy, lock, enterUnlocked, refresh, reloadSessions]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
