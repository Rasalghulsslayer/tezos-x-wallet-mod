/**
 * activity-vm — maps a core ActivityItem (the merged TzKT + Blockscout feed) to
 * the flat row shape the design's ActivityRow renders. Pure + unit-testable;
 * mirrors the fields the mock previously supplied (dir / verb / peer / runtime /
 * amount / symbol / status / ts).
 */

import type { ActivityItem } from '@tezosx/wallet-core/domain/activity';
import { formatTokenAmount } from '@tezosx/wallet-core/shared/format';

export interface ActivityRowVM {
  id: string;
  dir: 'out' | 'in';
  verb: string;
  peer: string;
  runtime: 'l1' | 'l2' | 'cross';
  amount: string;
  symbol: string;
  status: 'confirmed' | 'pending' | 'failed';
  ts: number;
}

export function toActivityRowVM(item: ActivityItem): ActivityRowVM {
  const runtime = item.kind === 'signature' ? 'l2' : item.runtime === 'cross-runtime' ? 'cross' : item.runtime;

  if (item.kind === 'transfer') {
    const isIn = item.direction === 'received';
    return {
      id: item.id,
      dir: isIn ? 'in' : 'out',
      verb: isIn ? 'Received' : 'Sent',
      peer: item.counterparty,
      runtime,
      // amount is raw base units (mutez / wei / token units) — scale by the
      // asset's decimals to a display string, as the extension's VM does.
      amount: formatTokenAmount(item.amount, item.asset.decimals),
      symbol: item.asset.symbol,
      status: item.status,
      ts: item.timestamp,
    };
  }
  if (item.kind === 'contract-call') {
    return {
      id: item.id, dir: 'out', verb: item.methodSig ?? 'Contract call', peer: item.target,
      runtime, amount: '', symbol: '', status: item.status, ts: item.timestamp,
    };
  }
  if (item.kind === 'signature') {
    return {
      id: item.id, dir: 'out', verb: 'Signed', peer: item.origin,
      runtime, amount: '', symbol: '', status: item.status, ts: item.timestamp,
    };
  }
  return {
    id: item.id, dir: 'out', verb: 'Transaction', peer: item.raw.ref,
    runtime, amount: '', symbol: '', status: 'confirmed', ts: item.timestamp,
  };
}
