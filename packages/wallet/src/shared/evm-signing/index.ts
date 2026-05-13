/**
 * EVM signing primitives: keccak256, RLP, EIP-1559 transaction signing,
 * EIP-191 personal_sign. Built on @noble/curves/secp256k1 and
 * @noble/hashes/sha3 — no viem dependency.
 */

export { keccak256 } from './keccak';
export { rlpEncode, type RlpInput } from './rlp';
export { signTransaction1559, type EvmTx1559 } from './sign-transaction-1559';
export { signPersonalMessage } from './sign-personal-message';
export { hexToBytes, bytesToHex, bigIntToBytes, concatBytes, padLeft } from './bytes';
