/**
 * EIP-191 personal_sign: signs keccak256("\x19Ethereum Signed Message:\n"
 * + len + msg). Returns a 65-byte signature (r || s || v) with v = 27 + recovery.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak256 } from './keccak';
import { bigIntToBytes, bytesToHex, concatBytes, hexToBytes, padLeft } from './bytes';

export function signPersonalMessage(
  message:       string | Uint8Array,
  privateKeyHex: string,
): `0x${string}` {
  const messageBytes = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message;
  const prefix      = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  const fullMessage = concatBytes(prefix, messageBytes);
  const sigHash     = hexToBytes(keccak256(fullMessage));

  const privBytes = hexToBytes(privateKeyHex);
  const sig       = secp256k1.sign(sigHash, privBytes, { lowS: true });
  const r         = padLeft(bigIntToBytes(sig.r), 32);
  const s         = padLeft(bigIntToBytes(sig.s), 32);
  const v         = 27 + sig.recovery;

  const sigBytes = new Uint8Array(65);
  sigBytes.set(r, 0);
  sigBytes.set(s, 32);
  sigBytes[64] = v;
  return `0x${bytesToHex(sigBytes)}` as `0x${string}`;
}
