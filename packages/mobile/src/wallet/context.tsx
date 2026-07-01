/**
 * WalletContext — the app's state machine + navigation + data seam (mirrors the
 * design's WalletCtx in mobile/app.jsx). Screens read everything through
 * useWallet(); the data providers (balances/tokens/activity/sessions) are backed
 * by mocks today and are the single seam to swap for the live composition.
 *
 * Navigation is a tab index (Home/Activity/dApps/Settings) plus a modal stack
 * (Send/Receive/Add…/onboarding). No third-party navigator — the shell in
 * App.tsx renders whatever this context points at.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  MOCK_ACCOUNTS, MOCK_BALANCES, MOCK_TOKENS, MOCK_ACTIVITY, MOCK_SESSIONS,
  type MockAccount, type MockBalance, type MockToken, type MockActivityItem,
  type MockSession, type PendingKind,
} from '../mocks';

export type VaultState = 'onboarding' | 'locked' | 'unlocked';
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
  vault: VaultState;
  accounts: MockAccount[];
  activeAccount: MockAccount;
  activeId: string;
  sessions: MockSession[];
  approve: { kind: PendingKind } | null;
  switcherOpen: boolean;
  toastMsg: string | null;
  stack: StackEntry[];
  navDir: 'fwd' | 'back';
  nav: WalletNav;

  balances: (id: string) => MockBalance;
  tokens: (id: string) => MockToken[];
  activity: (id: string) => MockActivityItem[];
  labelFor: (a: MockAccount | undefined) => string;

  toast: (msg: string) => void;
  copy: (addr: string) => void;
  setActive: (id: string) => void;
  lock: () => void;
  unlock: () => void;
  finishOnboarding: (id: string) => void;
  resetToWelcome: () => void;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  openApprove: (kind: PendingKind) => void;
  closeApprove: (goTab?: TabId | null) => void;
  addSession: (origin: string, accountId: string) => void;
  disconnect: (origin: string) => void;
  addToken: (tok: Omit<MockToken, 'runtime' | 'builtin'>) => void;
  removeToken: (address: string) => void;
  addAccount: (kind: 'tezos' | 'evm', label: string) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (ctx == null) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({
  initialVault = 'unlocked',
  children,
}: {
  initialVault?: VaultState;
  children: React.ReactNode;
}): React.JSX.Element {
  const [vault, setVault] = useState<VaultState>(initialVault);
  const [accounts, setAccounts] = useState<MockAccount[]>(() => MOCK_ACCOUNTS.map((a) => ({ ...a })));
  const [activeId, setActiveId] = useState('acc-1');
  const [sessions, setSessions] = useState<MockSession[]>(() => MOCK_SESSIONS.map((s) => ({ ...s })));
  const [tokensMap, setTokensMap] = useState<Record<string, MockToken[]>>(
    () => JSON.parse(JSON.stringify(MOCK_TOKENS)) as Record<string, MockToken[]>,
  );
  const [balancesMap] = useState<Record<string, MockBalance>>(() => ({ ...MOCK_BALANCES }));
  const [activityMap] = useState<Record<string, MockActivityItem[]>>(() => ({ ...MOCK_ACTIVITY }));

  const [tab, setTab] = useState<TabId>('home');
  const [stack, setStack] = useState<StackEntry[]>([]);
  const [navDir, setNavDir] = useState<'fwd' | 'back'>('fwd');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [approve, setApprove] = useState<{ kind: PendingKind } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeAccount = accounts.find((a) => a.id === activeId) ?? accounts[0];

  const toast = useCallback((msg: string): void => {
    setToastMsg(msg);
    if (toastTimer.current != null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
  }, []);
  const copy = useCallback((_addr: string): void => toast('Address copied'), [toast]);

  const labelFor = useCallback((a: MockAccount | undefined): string => {
    if (a == null) return 'Account';
    if (a.label.trim() !== '') return a.label;
    const idx = accounts.findIndex((x) => x.id === a.id);
    return `Account ${idx + 1}`;
  }, [accounts]);

  const nav = useMemo<WalletNav>(() => ({
    tab,
    push: (name, params = {}) => { setNavDir('fwd'); setStack((s) => [...s, { name, params }]); },
    back: () => { setNavDir('back'); setStack((s) => s.slice(0, -1)); },
    goTab: (id) => { setStack([]); setTab(id); },
    reset: () => { setStack([]); setTab('home'); },
  }), [tab]);

  const value = useMemo<WalletContextValue>(() => ({
    vault, accounts, activeAccount, activeId, sessions, approve, switcherOpen, toastMsg, stack, navDir, nav,
    balances: (id) => balancesMap[id] ?? { xtz: '0', tokens: {} },
    tokens: (id) => tokensMap[id] ?? [],
    activity: (id) => activityMap[id] ?? [],
    labelFor, toast, copy,
    setActive: (id) => setActiveId(id),
    lock: () => { setStack([]); setSwitcherOpen(false); setApprove(null); setVault('locked'); },
    unlock: () => { setVault('unlocked'); setTab('home'); },
    finishOnboarding: (id) => { setActiveId(id); setStack([]); setVault('unlocked'); setTab('home'); },
    resetToWelcome: () => { setStack([]); setVault('onboarding'); },
    openSwitcher: () => setSwitcherOpen(true),
    closeSwitcher: () => setSwitcherOpen(false),
    openApprove: (kind) => setApprove({ kind }),
    closeApprove: (goTab) => { setApprove(null); if (goTab != null) { setStack([]); setTab(goTab); } },
    addSession: (origin, accountId) =>
      setSessions((s) => (s.some((x) => x.origin === origin) ? s : [{ origin, accountId, connectedAt: Date.now() }, ...s])),
    disconnect: (origin) => { setSessions((s) => s.filter((x) => x.origin !== origin)); toast('Disconnected'); },
    addToken: (tok) => setTokensMap((m) => ({ ...m, [activeId]: [...(m[activeId] ?? []), { ...tok, runtime: 'evm' }] })),
    removeToken: (address) => setTokensMap((m) => ({ ...m, [activeId]: (m[activeId] ?? []).filter((x) => x.address !== address) })),
    addAccount: (kind, label) => {
      const id = `acc-${accounts.length + 1}`;
      const base: MockAccount = kind === 'evm'
        ? { id, kind: 'evm', label, createdAt: Date.now(), address: '0x51F3aa9e12bC7d4E90aF3b28c6D1e5A70bF94c22' }
        : { id, kind: 'tezos', label, createdAt: Date.now(), tz1: 'tz1newAcct9Qm4kP2wXbEjHsA6cZ4uPnGqLd', evmAlias: '0xC1a9F2013b7d4E90aF3b28c6D1e5A70bF9C4d221', seed: MOCK_ACCOUNTS[0].kind === 'tezos' ? MOCK_ACCOUNTS[0].seed : undefined };
      setAccounts((a) => [...a, base]);
      balancesMap[id] = { xtz: '0.00', tokens: {} };
      activityMap[id] = [];
      setTokensMap((m) => ({ ...m, [id]: [] }));
      setActiveId(id);
    },
  }), [vault, accounts, activeAccount, activeId, sessions, approve, switcherOpen, toastMsg, stack, navDir, nav,
      balancesMap, tokensMap, activityMap, labelFor, toast, copy]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
