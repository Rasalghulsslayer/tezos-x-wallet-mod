/**
 * EIP-191 personal_sign: signs keccak256("\x19Ethereum Signed Message:\n"
 * + len + msg). Returns a 65-byte signature (r || s || v) with v = 27 + recovery.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak256 } from './keccak';
import { bytesToHex, concatBytes, hexToBytes } from './bytes';
import { wipe } from '../wipe';

/**
 * Normalise a `personal_sign` data parameter to the exact bytes to sign.
 *
 * Per EIP-191 / MetaMask convention the parameter is hex-encoded bytes, so a
 * `0x…` value is decoded to its bytes (NOT treated as a UTF-8 string). This is
 * what makes the signed bytes match what the approval UI shows, which likewise
 * hex-decodes the payload for display. A non-hex value is signed as UTF-8.
 */
export function normalizePersonalSignMessage(param: string): Uint8Array {
  const isHex = param.startsWith('0x')
    && param.length % 2 === 0
    && /^0x[0-9a-fA-F]*$/.test(param);
  return isHex ? hexToBytes(param) : new TextEncoder().encode(param);
}

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

  // @noble/curves v2: sign() returns a Uint8Array. With `format: 'recovered'`
  // the layout is [recovery(1), r(32), s(32)]. We re-assemble in EIP-191
  // order [r(32), s(32), v(1)] with v = 27 + recovery.
  // `prehash: false` is critical — v2 defaults to true and would re-hash our
  // keccak256 sigHash with sha256.
  const recovered = secp256k1.sign(sigHash, privBytes, { lowS: true, prehash: false, format: 'recovered' });
  const out = new Uint8Array(65);
  out.set(recovered.subarray(1, 33), 0);    // r
  out.set(recovered.subarray(33, 65), 32);  // s
  out[64] = 27 + recovered[0];              // v
  const hex = `0x${bytesToHex(out)}` as `0x${string}`;
  // The key bytes have served their purpose (noble keeps its own internal
  // copy out of reach; the signature itself is handed to the dApp anyway).
  wipe(privBytes, recovered);
  return hex;
}
