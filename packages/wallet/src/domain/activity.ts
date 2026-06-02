/**
 * Activity types — pure domain shape for the merged TzKT + Blockscout feed.
 * No I/O; consumed by `use-cases/list-activity.ts` and the UI view-model.
 */

import type { Asset } from './asset';

export type ActivityDirection = 'sent' | 'received' | 'self';
export type ActivityStatus    = 'pending' | 'confirmed' | 'failed';
export type ActivityRuntime   = 'l1' | 'l2' | 'cross-runtime';

export interface ActivityLinks {
  primary:    { explorer: 'tzkt' | 'blockscout'; url: string };
  secondary?: { explorer: 'tzkt' | 'blockscout'; url: string };
}

export interface CrossRuntimeMeta {
  direction:        'tezos-to-evm' | 'evm-to-tezos';
  l1OpHash:         string;
  l2TxHash?:        string;
  evmEffectStatus:  'pending' | 'confirmed' | 'failed' | 'unresolved';
  tzktOperationId?: number;
}

export interface ActivityTransferItem {
  id:            string;
  kind:          'transfer';
  direction:     ActivityDirection;
  runtime:       ActivityRuntime;
  counterparty:  string;
  asset:         Asset;
  amount:        string;
  timestamp:     number;
  status:        ActivityStatus;
  links:         ActivityLinks;
  crossRuntime?: CrossRuntimeMeta;
}

export interface ActivityContractCallItem {
  id:            string;
  kind:          'contract-call';
  runtime:       ActivityRuntime;
  target:        string;
  methodSig?:    string;
  direction:     'sent';
  timestamp:     number;
  status:        ActivityStatus;
  links:         ActivityLinks;
  crossRuntime?: CrossRuntimeMeta;
}

export interface ActivitySignatureItem {
  id:        string;
  kind:      'signature';
  origin:    string;
  timestamp: number;
  status:    'confirmed' | 'failed';
}

export interface ActivityUnknownItem {
  id:        string;
  kind:      'unknown';
  runtime:   ActivityRuntime;
  timestamp: number;
  links:     ActivityLinks;
  raw:       { source: 'tzkt' | 'blockscout'; ref: string };
}

export type ActivityItem =
  | ActivityTransferItem
  | ActivityContractCallItem
  | ActivitySignatureItem
  | ActivityUnknownItem;

export interface ActivityFilter {
  direction?:                  Array<ActivityDirection>;
  runtime?:                    Array<ActivityRuntime>;
  includeAliasSelfTransfers?:  boolean;
}

export interface ActivityFetchError {
  source:  'tezos' | 'evm';
  message: string;
}

export interface ActivityPage {
  items:     ActivityItem[];
  cursor?:   string;
  staleness: 'fresh' | 'partial' | 'cached-only';
  errors?:   ActivityFetchError[];
}

/**
 * Cursor opaque to the UI. Internally a JSON-encoded base64 blob holding
 * per-source pagination state. The UI passes it through verbatim.
 */
export type ActivityCursor = string & { readonly __activityCursor: unique symbol };

interface ActivityCursorPayload {
  tezos?: { lastId: number };
  evm?:   { block: number; index: number };
}

export function encodeActivityCursor(payload: ActivityCursorPayload): ActivityCursor {
  return btoa(JSON.stringify(payload)) as ActivityCursor;
}

export function decodeActivityCursor(cursor: string | undefined): ActivityCursorPayload {
  if (cursor == null || cursor === '') return {};
  try {
    return JSON.parse(atob(cursor)) as ActivityCursorPayload;
  } catch {
    return {};
  }
}
