/**
 * Shared message types between popup, content, injected, approve, service worker.
 * All runtime boundaries in the wallet flow through one of these.
 */

import type { RequestArguments } from '@tezosx/relayer/types';
import type { ActivityFilter, ActivityPage } from '../domain/activity';
import type { AccountSummary, AccountKind, AccountId, AddAccountSource } from '../domain/account';
import type { Asset } from '../domain/asset';

export type { ActivityFilter, ActivityPage, AccountSummary, AddAccountSource };

// ── Vault / session state snapshot ────────────────────────────────────────────

export type VaultStateUnlocked =
  | {
      status:    'unlocked';
      kind:      'tezos';
      accountId: string;
      tz1:       string;
      evmAlias:  string;             // alias derived from tz1
      accounts:  AccountSummary[];   // every account in the vault, sorted by createdAt ASC
      hasSeed?:  boolean;            // wallet-level seed present → derived accounts available
    }
  | {
      status:    'unlocked';
      kind:      'evm';
      accountId: string;
      address:   `0x${string}`;
      accounts:  AccountSummary[];
      hasSeed?:  boolean;
    };

export type VaultState =
  | { status: 'empty'  }
  | { status: 'locked' }
  | VaultStateUnlocked;

// ── Pending dApp approval requests ────────────────────────────────────────────

export interface PendingConnection {
  kind:      'connect';
  requestId: string;
  origin:    string;
  accountId: AccountId;        // pinned at enqueue time; resolves through this account's container
  createdAt: number;
}

export interface PendingTransaction {
  kind:         'transaction';
  requestId:    string;
  origin:       string;
  accountId:    AccountId;
  to:           string;
  value:        string;
  data:         string;
  methodSig?:   string;        // resolved by the gateway (e.g. "approve(address,uint256)")
  createdAt:    number;
  /**
   * Present for Tezos-source eth_sendTransaction. The dApp asked for an EVM
   * call against `to/value/data`; the wallet will actually sign a Michelson
   * call against `michelsonTarget/entrypoint`, with `mutezValue` debited
   * (post wei→mutez conversion). The Approve UI surfaces both — dApp intent
   * AND what gets signed — so the user can verify they match.
   */
  crossRuntime?: {
    michelsonTarget: string;          // KT1 NAC gateway address
    entrypoint:      string;          // 'call' (bare transfer, HTTP %call) | 'call_evm' (ABI call)
    decodedSelector: string | null;   // null when calldata is empty (bare-transfer `call`)
    mutezValue:      string;          // decimal mutez string
  };
}

export interface PendingSignature {
  kind:       'signature';
  requestId:  string;
  origin:     string;
  accountId:  AccountId;
  message:    string;          // raw hex string sent by the dApp
  decoded?:   string;          // best-effort utf-8 decode for display
  createdAt:  number;
}

export type PendingRequest = PendingConnection | PendingTransaction | PendingSignature;

// ── Popup UI → Service Worker ─────────────────────────────────────────────────

export type PopupRequest =
  | { type: 'GET_STATE' }
  | { type: 'CREATE_WALLET';      mnemonic:   string; password: string }   // Tezos
  | { type: 'IMPORT_WALLET';      mnemonic:   string; password: string }   // Tezos
  | { type: 'IMPORT_SECRET_KEY';  edsk:       string; password: string }   // Tezos edsk
  | { type: 'IMPORT_EVM_PRIVKEY'; privateKey: string; password: string }   // EVM
  | { type: 'UNLOCK';        password: string }
  | { type: 'LOCK' }
  | { type: 'EXPORT_SEED';   password: string; accountId?: AccountId }
  | { type: 'EXPORT_WALLET_SEED'; password: string }
  | { type: 'SEND_TX';       to: string; amount: string; asset: Asset }
  | { type: 'RESOLVE_TX';    syntheticHash: string }
  | { type: 'LIST_PENDING' }
  | { type: 'LIST_SESSIONS' }
  | { type: 'LIST_ACTIVITY'; cursor?: string; limit?: number; filter?: ActivityFilter }
  | { type: 'DISCONNECT';    origin: string }
  | { type: 'ADD_ACCOUNT';        kind: AccountKind; source: AddAccountSource; label?: string }
  | { type: 'REMOVE_ACCOUNT';     accountId: AccountId; password: string }
  | { type: 'SET_ACTIVE_ACCOUNT'; accountId: AccountId }
  | { type: 'RENAME_ACCOUNT';     accountId: AccountId; label: string }
  | { type: 'LIST_ACCOUNTS' }
  | { type: 'PEEK_CUSTOM_TOKEN';   address: string; tryAnyway?: boolean }
  | { type: 'ADD_CUSTOM_TOKEN';    address: string; tryAnyway?: boolean }
  | { type: 'REMOVE_CUSTOM_TOKEN'; address: string }
  | { type: 'LIST_REGISTERED_TOKENS' }
  | { type: 'ADD_CONTACT';    address: string; label: string }
  | { type: 'RENAME_CONTACT'; address: string; label: string }
  | { type: 'REMOVE_CONTACT'; address: string }
  | { type: 'LIST_CONTACTS' };

// ── Approve.html → Service Worker ─────────────────────────────────────────────

export type ApproveRequest =
  | { type: 'GET_PENDING';      requestId: string }
  | { type: 'RESOLVE_PENDING';  requestId: string; decision: 'approve' | 'reject' };

// ── Content script → Service Worker (EIP-1193 bridge) ─────────────────────────

export interface EthereumRequest {
  type:       'ETHEREUM_REQUEST';
  origin:     string;
  requestId:  string;
  args:       RequestArguments;
}

// ── Service Worker → Content script (push events) ─────────────────────────────

export type ContentPush =
  // `origin` scopes the event to a single connected origin (each origin only
  // ever hears about the account bound to its own session — an active-account
  // switch must not disclose the new account to origins connected with a
  // different one). Absent = deliver to every connected origin.
  | { type: 'PROVIDER_EVENT'; event: 'accountsChanged'; data: string[]; origin?: string }
  | { type: 'PROVIDER_EVENT'; event: 'chainChanged';    data: string }
  | { type: 'PROVIDER_EVENT'; event: 'connect';         data: { chainId: string } }
  | { type: 'PROVIDER_EVENT'; event: 'disconnect';      data: { code: number; message: string } }
  /** Signals whether outgoing EVM calls currently route through the Tezos X
   *  NAC gateway (true for a tz1-source active account) or directly to the
   *  EVM runtime (false for a 0x-source active account). Consumed by the
   *  injected provider to keep its `isTezosXRelayer` flag accurate so dApps
   *  with TezosX-aware branching pick the right flow. Pushed on every
   *  container rebuild (unlock, account switch, lock). */
  | { type: 'WALLET_ROLE'; routesViaRelayer: boolean }
  | { type: 'ETHEREUM_RESPONSE'; requestId: string; ok: true;  result: unknown }
  | { type: 'ETHEREUM_RESPONSE'; requestId: string; ok: false; code: number; message: string };

// ── Unified response envelope for request/response messages ───────────────────

export type WalletResponse<T = unknown> =
  | { ok: true;  data?: T }
  | { ok: false; code: number; message: string };

/**
 * Result of a SEND_TX.
 *
 * - `l1` — native Michelson runtime transfer. `hash` is the final L1 op hash.
 * - `l2` — EVM-side transfer or NAC gateway cross-runtime. For the gateway
 *   path, `hash` is the synthetic NAC hash; the popup must then poll
 *   `RESOLVE_TX` to swap it for the kernel-synthesized real EVM hash before
 *   showing "Done". For native EVM transfers (EVM account → 0x), `hash` is
 *   already the real EVM hash and resolution is a no-op.
 */
export type SendTxResult =
  | { runtime: 'l1'; hash: string }
  // `l1OpHash` is present on the NAC gateway path: the L1 operation whose
  // inclusion can be tracked on TzKT while the kernel hash resolves.
  | { runtime: 'l2'; hash: string; l1OpHash?: string };

/** Result of a RESOLVE_TX call. */
export type ResolveTxResult =
  | { resolved: true;  hash: string }
  | { resolved: false };
