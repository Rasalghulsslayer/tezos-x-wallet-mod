import { TezlinkClient } from '@tezosx/relayer/tezlink';
import { TEZOS_L1_RPC } from '@tezosx/relayer/constants';

const tezlink = new TezlinkClient();

/** Fetch native XTZ balance on the Michelson runtime (mutez as decimal string) for a tz1/tz2/tz3/KT1. */
export async function fetchL1XtzBalance(tz1: string): Promise<string> {
  const res = await fetch(`${TEZOS_L1_RPC}/chains/main/blocks/head/context/contracts/${tz1}/balance`);
  if (!res.ok) throw new Error(`L1 RPC ${res.status}: ${await res.text()}`);
  return (await res.json()) as string;
}

/** Standard ERC-20 balanceOf(address) selector. */
const BALANCE_OF_SELECTOR = '0x70a08231';

/** ABI-encode a single address (padded to 32 bytes) for eth_call. */
function encodeAddressParam(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/** Fetch native XTZ balance (hex wei) for an EVM alias via eth_getBalance. */
export async function fetchXtzBalance(evmAddr: string): Promise<string> {
  return tezlink.getBalance(evmAddr);
}

/** Fetch ERC-20 balance via eth_call (returns hex raw uint256). */
export async function fetchErc20Balance(token: string, holder: string): Promise<string> {
  return tezlink.call(
    { to: token, data: BALANCE_OF_SELECTOR + encodeAddressParam(holder) },
    'latest',
  );
}
