import { TezlinkClient } from 'tezosx-relayer/tezlink';

const tezlink = new TezlinkClient();

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
