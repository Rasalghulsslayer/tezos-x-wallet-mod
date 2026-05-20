/**
 * Shared message types between popup, content, injected, approve, service worker.
 * All runtime boundaries in the wallet flow through one of these.
 */

import type { RequestArguments } from '@tezosx/relayer/types';
import type { ActivityFilter, ActivityPage } from '../domain/activity';
import type { AccountSummary } from '../domain/account';

export type { ActivityFilter, ActivityPage, AccountSummary };

// ── Vault / session state snapshot ────────────────────────────────────────────

export type VaultStateUnlocked =
  | {
      status:    'unlocked';
      kind:      'tezos';
      accountId: string;
      tz1:       string;
      evmAlias:  string;             // alias derived from tz1
      accounts:  AccountSummary[];   // every account in the vault, sorted by createdAt ASC
    }
  | {
      status:    'unlocked';
      kind:      'evm';
      accountId: string;
      address:   `0x${string}`;
      accounts:  AccountSummary[];
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
  createdAt: number;
}

export interface PendingTransaction {
  kind:         'transaction';
  requestId:    string;
  origin:       string;
  to:           string;
  value:        string;
  data:         string;
  methodSig?:   string;        // resolved by the gateway (e.g. "approve(address,uint256)")
  createdAt:    number;
}

export interface PendingSignature {
  kind:       'signature';
  requestId:  string;
  origin:     string;
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
  | { type: 'EXPORT_SEED';   password: string }
  | { type: 'SEND_TX';       to: string; amount: string; asset: 'XTZ' | 'USDC' }
  | { type: 'RESOLVE_TX';    syntheticHash: string }
  | { type: 'LIST_PENDING' }
  | { type: 'LIST_SESSIONS' }
  | { type: 'LIST_ACTIVITY'; cursor?: string; limit?: number; filter?: ActivityFilter }
  | { type: 'DISCONNECT';    origin: string };

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
  | { type: 'PROVIDER_EVENT'; event: 'accountsChanged'; data: string[] }
  | { type: 'PROVIDER_EVENT'; event: 'chainChanged';    data: string }
  | { type: 'PROVIDER_EVENT'; event: 'connect';         data: { chainId: string } }
  | { type: 'PROVIDER_EVENT'; event: 'disconnect';      data: { code: number; message: string } }
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
  | { runtime: 'l2'; hash: string };

/** Result of a RESOLVE_TX call. */
export type ResolveTxResult =
  | { resolved: true;  hash: string }
  | { resolved: false };
