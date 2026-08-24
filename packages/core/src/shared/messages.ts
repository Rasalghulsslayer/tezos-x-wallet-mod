/**
 * Shared message types between popup, content, injected, approve, service worker.
 * All runtime boundaries in the wallet flow through one of these.
 */

import type { RequestArguments } from '@tezosx/relayer/types';
import type { ActivityFilter, ActivityPage } from '../domain/activity';
import type { AccountSummary, AccountKind, AccountId, AddAccountSource } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BeaconNetwork } from '../domain/beacon';
import type { OpLimits, OpParameter } from '../domain/tezos-operation';

export type { ActivityFilter, ActivityPage, AccountSummary, AddAccountSource };

// ── Vault / session state snapshot ────────────────────────────────────────────

export type VaultStateUnlocked =
  | {
      status:    'unlocked';
      kind:      'tezos';
      accountId: string;
      tz1:       string;
      // The kernel alias of the tz1. null until the background resolution
      // lands (first unlock of an account, or offline) — the mapping lives on
      // the node and unlock must never wait for it. UI shows a resolving
      // placeholder while null.
      evmAlias:  string | null;
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
  /**
   * Which dApp surface asked. Absent — every pre-Beacon caller — means the
   * EIP-1193 (`window.ethereum`) path, where the site receives the account's
   * EVM alias. `'beacon'` means a Beacon dApp, which receives the tz1 and its
   * public key instead. The Approve screen has to say which, because "the site
   * will see your 0x address" is simply false for a Beacon connection.
   */
  protocol?: 'beacon';
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

/**
 * A native Michelson operation awaiting approval, from a Beacon dApp.
 *
 * A separate kind rather than a reuse of `PendingTransaction`, whose
 * `to`/`value`/`data` are EVM-shaped: a Beacon operation has a Michelson
 * destination, a mutez amount and a Micheline parameter, and filling EVM fields
 * with them would make the approval screen describe an operation that is not the
 * one being signed.
 */
export interface PendingTezosOperation {
  kind:        'tezos-operation';
  requestId:   string;
  origin:      string;
  accountId:   AccountId;
  createdAt:   number;
  /** KT1 or tz1. */
  destination: string;
  /** Decimal mutez string. */
  amount:      string;
  entrypoint?: string;
  /** Compact Micheline for display only; never re-parsed into an operation. */
  parametersPreview?: string;
  /** The dApp's pin, when it priced the operation itself. */
  limits?:     OpLimits;
  /**
   * Worst case the operator is consenting to LEAVE THE ACCOUNT, in mutez: the
   * transferred amount, plus the fee charged in full, plus the entire storage
   * allowance at `cost_per_byte`.
   *
   * The amount is in it deliberately. Omitting it made the one bold money figure
   * on the approval screen understate a value-bearing call by the whole transfer
   * — a 5 XTZ send would have advertised a 0.004 XTZ ceiling.
   *
   * Present only for a pinned operation: an unpinned one has no ceiling until the
   * wallet has estimated it, and a consent figure that can be exceeded is not
   * consent.
   */
  maxCostMutez?: string;
}

export type PendingRequest =
  | PendingConnection
  | PendingTransaction
  | PendingSignature
  | PendingTezosOperation;

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
  | { type: 'LIST_CONTACTS' }
  | { type: 'CHANGE_PASSWORD'; currentPassword: string; newPassword: string }
  // Forgot-password recovery: destroys the sealed vault so the user can
  // re-onboard from the seed phrase. Deliberately usable while locked.
  | { type: 'RESET_WALLET' };

// ── Approve.html → Service Worker ─────────────────────────────────────────────

export type ApproveRequest =
  | { type: 'GET_PENDING';      requestId: string }
  | { type: 'RESOLVE_PENDING';  requestId: string; decision: 'approve' | 'reject' };

// ── Service Worker → wallet views (long-lived UI port) ────────────────────────

/** Name of the long-lived port a wallet view (popup / side panel) opens on
 *  mount. Its presence tells the SW a trusted view is open, so dApp approvals
 *  can render inside it instead of spawning an approve.html window. */
export const UI_PORT_NAME = 'tezosx-ui';

/** Push sent over the UI port whenever the pending-approval set changes; the
 *  view answers by re-reading LIST_PENDING. */
export type UiPortPush = { type: 'PENDING_CHANGED' };

/** Sent by the view over the UI port on connect and on every visibility
 *  change. Only a visible view counts as an open surface for approvals — a
 *  wallet sitting in a background tab or a minimized window must not capture
 *  an approval the user cannot see. */
export type UiPortViewMessage = { type: 'VIEW_VISIBILITY'; visible: boolean };

// ── Content script → Service Worker (EIP-1193 bridge) ─────────────────────────

export interface EthereumRequest {
  type:       'ETHEREUM_REQUEST';
  origin:     string;
  requestId:  string;
  args:       RequestArguments;
}

// ── Content script → Service Worker (Beacon bridge) ───────────────────────────

/**
 * A Beacon request, already narrowed by the content script to the fields core
 * needs. `requestId` is minted in the content script (never the dApp's Beacon
 * message id), so a page can neither choose nor collide the key the approval
 * queue tracks it under — same rule as the EIP-1193 bridge.
 */
export interface BeaconRequest {
  type:      'BEACON_REQUEST';
  origin:    string;
  requestId: string;
  request:   BeaconPermissionRequest | BeaconOperationRequest;
}

/** The narrowed `permission_request`. */
export interface BeaconPermissionRequest {
  kind:     'permission';
  /** The network the dApp pinned, if any. Checked, never echoed. */
  network?: BeaconNetwork;
  /** The Beacon `PermissionScope` values the dApp asked for. */
  scopes?:  readonly string[];
}

/**
 * The narrowed `operation_request` — exactly ONE Michelson transaction.
 *
 * Beacon's `operationDetails` is an array and may carry kinds other than
 * `transaction`; the content script refuses anything else before this envelope
 * exists, so core never has to reason about a batch or an origination.
 */
export interface BeaconOperationRequest {
  kind:      'operation';
  operation: BeaconTransaction;
}

/** One `transaction`, as the dApp specified it. */
export interface BeaconTransaction {
  /** Any destination the ceremony targets: a per-role originator, a child KT1, the gateway. */
  destination: string;
  /** Decimal mutez string. `'0'` for a pure contract call. */
  amount:      string;
  /**
   * Absent for a plain transfer. Paired by construction: an entrypoint without a
   * value would render as a contract call and forge as a transfer.
   */
  parameter?:  OpParameter;
  /**
   * Present only when the dApp priced the operation itself, and then complete.
   * Honoured verbatim — see the header of `adapters/tezos/tezos-signer.ts` for
   * why re-estimating one knob of a supplied pin breaks the other two.
   */
  limits?:     OpLimits;
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
