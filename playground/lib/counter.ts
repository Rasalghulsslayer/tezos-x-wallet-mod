import { TEZLINK_EVM_RPC } from './network';

export { TEZLINK_EVM_RPC };

export const COUNTER_ADDRESS = '0x525982C267F4B93cCB075B9323B069A993a9DEd7';

export const SELECTORS = {
  increment: '0xd09de08a',
  decrement: '0x2baeceb7',
  setNumber: '0x3fb5c1cb',
  retrieve:  '0x2e64cec1',
} as const;

export function encodeSetNumber(num: bigint): string {
  return `${SELECTORS.setNumber}${num.toString(16).padStart(64, '0')}`;
}

export async function readCounter(): Promise<bigint> {
  const res = await fetch(TEZLINK_EVM_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: COUNTER_ADDRESS, data: SELECTORS.retrieve }, 'latest'],
    }),
  });
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  const raw = json.result;
  if (!raw || raw === '0x') return BigInt(0);
  return BigInt(raw);
}
