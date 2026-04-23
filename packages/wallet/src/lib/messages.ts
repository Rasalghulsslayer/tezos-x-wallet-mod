/**
 * Shared message types between popup, content, injected, approve, service worker.
 * All runtime boundaries in the wallet flow through one of these.
 */

import type { RequestArguments } from 'tezosx-relayer/types';

// ── Vault / session state snapshot ────────────────────────────────────────────

export type VaultState =
  | { status: 'empty' }                                   // no wallet created yet
  | { status: 'locked' }                                  // vault persisted, awaiting password
  | { status: 'unlocked'; tz1: string; evmAlias: string }; // unlocked in SW memory

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

export type PendingRequest = PendingConnection | PendingTransaction;

// ── Popup UI → Service Worker ─────────────────────────────────────────────────

export type PopupRequest =
  | { type: 'GET_STATE' }
  | { type: 'CREATE_WALLET'; mnemonic: string; password: string }
  | { type: 'IMPORT_WALLET'; mnemonic: string; password: string }
  | { type: 'UNLOCK';        password: string }
  | { type: 'LOCK' }
  | { type: 'EXPORT_SEED';   password: string }
  | { type: 'SEND_TX';       to: string; amount: string; asset: 'XTZ' | 'USDC' }
  | { type: 'LIST_PENDING' }
  | { type: 'LIST_SESSIONS' }
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

// ── Stored session (persisted in chrome.storage.local) ────────────────────────

export interface StoredSession {
  origin:      string;
  tz1Address:  string;
  evmAlias:    string;
  chainId:     string;
  connectedAt: number;
}
