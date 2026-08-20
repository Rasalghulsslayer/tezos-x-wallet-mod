/**
 * activityRowVM: project an ActivityItem into a display-ready ActivityRowVM
 * consumed by ActivityRow. No I/O; deterministic from the input.
 *
 * The row leads with the asset's logo (ring-as-runtime around it) + a
 * verb·arrow·address title (no pills inline), so the VM exposes the
 * structured pieces rather than a pre-rendered title string.
 */

import { dayGroupOf, formatTokenAmount, shortAddr, timeAgo } from '@tezosx/wallet-core/shared/format';
import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';
import type { Asset } from '@tezosx/wallet-core/domain/asset';

export type RuntimeBadge = 'l1' | 'l2' | 'cross';

export interface ActivityRowVM {
  id:            string;
  verb:          'Sent' | 'Received' | 'Self-transfer' | 'Contract call' | 'Signed message' | 'Activity';
  arrow:         '→' | '←' | '·';                  // sent / received / neutral
  counterparty:  string;                            // shortAddr() form, ready for mono span
  runtimeBadge:  RuntimeBadge;
  runtimeTag:    'Michelson' | 'EVM' | 'Michelson → EVM' | 'EVM → Michelson';
  amount:        { value: string; sign: '+' | '−' | '' };
  asset:         string;
  assetRef:      Asset | null;                      // full Asset for transfers — drives the row's logo
  status:        'pending' | 'confirmed' | 'failed';
  ago:           string;                            // "4s ago" | "Pending · 22s" | "Failed" | "yesterday"
  primaryUrl:    string;
  secondaryUrl?: string;
  dayGroup:      'Today' | 'Yesterday' | 'Earlier';
}

function fmtAmount(item: ActivityItem): string {
  if (item.kind !== 'transfer') return '';
  return formatTokenAmount(item.amount, item.asset.decimals);
}

function runtimeBadgeOf(item: ActivityItem): RuntimeBadge {
  if (item.kind === 'signature') return 'l2';
  return item.runtime === 'cross-runtime' ? 'cross' : item.runtime;
}

function runtimeTagOf(item: ActivityItem): ActivityRowVM['runtimeTag'] {
  if (item.kind === 'signature') return 'EVM';
  if (item.runtime === 'l1')     return 'Michelson';
  if (item.runtime === 'l2')     return 'EVM';
  // cross-runtime — disambiguate by direction
  if (item.kind === 'transfer' || item.kind === 'contract-call') {
    return item.crossRuntime?.direction === 'evm-to-tezos'
      ? 'EVM → Michelson'
      : 'Michelson → EVM';
  }
  return 'Michelson → EVM';
}

/** Status-aware timestamp: a live status wins over the age, otherwise the
 *  wallet-wide relative time (with a friendlier word for the day before). */
function agoOf(item: ActivityItem, nowMs: number): string {
  if (item.kind !== 'signature' && item.kind !== 'unknown' && item.status === 'pending') {
    const secs = Math.max(0, Math.round((nowMs - item.timestamp) / 1000));
    return `Pending · ${secs}s`;
  }
  if ((item.kind === 'transfer' || item.kind === 'contract-call') && item.status === 'failed') {
    return 'Failed';
  }
  const hours = Math.floor((nowMs - item.timestamp) / 3_600_000);
  if (hours >= 24 && hours < 48) return 'yesterday';
  return timeAgo(item.timestamp, nowMs);
}

export function activityRowVM(item: ActivityItem, nowMs: number = Date.now()): ActivityRowVM {
  const runtimeBadge = runtimeBadgeOf(item);
  const runtimeTag   = runtimeTagOf(item);
  const ago          = agoOf(item, nowMs);
  const dayGroup     = dayGroupOf(item.timestamp, nowMs);

  if (item.kind === 'transfer') {
    const sign: '+' | '−' | '' =
      item.direction === 'received' ? '+' :
      item.direction === 'sent'     ? '−' :
                                      '';
    const verb: ActivityRowVM['verb'] =
      item.direction === 'received' ? 'Received' :
      item.direction === 'self'     ? 'Self-transfer' :
                                      'Sent';
    const arrow: ActivityRowVM['arrow'] =
      item.direction === 'received' ? '←' :
      item.direction === 'self'     ? '·' :
                                      '→';
    return {
      id:           item.id,
      verb,
      arrow,
      counterparty: shortAddr(item.counterparty),
      runtimeBadge,
      runtimeTag,
      amount:       { value: fmtAmount(item), sign },
      asset:        item.asset.symbol,
      assetRef:     item.asset,
      status:       item.status,
      ago,
      primaryUrl:   item.links.primary.url,
      secondaryUrl: item.links.secondary?.url,
      dayGroup,
    };
  }

  if (item.kind === 'contract-call') {
    return {
      id:           item.id,
      verb:         'Contract call',
      arrow:        '→',
      counterparty: shortAddr(item.target),
      runtimeBadge,
      runtimeTag,
      amount:       { value: '', sign: '' },
      asset:        '',
      assetRef:     null,
      status:       item.status,
      ago,
      primaryUrl:   item.links.primary.url,
      secondaryUrl: item.links.secondary?.url,
      dayGroup,
    };
  }

  if (item.kind === 'signature') {
    return {
      id:           item.id,
      verb:         'Signed message',
      arrow:        '·',
      counterparty: shortAddr(item.origin),
      runtimeBadge: 'l2',
      runtimeTag:   'EVM',
      amount:       { value: '', sign: '' },
      asset:        '',
      assetRef:     null,
      status:       item.status,
      ago,
      primaryUrl:   '',
      dayGroup,
    };
  }

  // unknown
  return {
    id:           item.id,
    verb:         'Activity',
    arrow:        '·',
    counterparty: shortAddr(item.raw.ref),
    runtimeBadge,
    runtimeTag,
    amount:       { value: '', sign: '' },
    asset:        '',
    assetRef:     null,
    status:       'confirmed',
    ago,
    primaryUrl:   item.links.primary.url,
    dayGroup,
  };
}
