/**
 * Input validators and address-shape detection: detectRuntime,
 * isValidAddress, isValidMnemonic, isValidEdsk, isValidBip39Word.
 */

import { validateMnemonic as scureValidateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import type { DestRuntime } from './chain';

const TZ_ADDR_RE  = /^(tz[1234]|KT1)[a-zA-Z0-9]{33}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const EDSK_REGEX  = /^edsk(?:[1-9A-HJ-NP-Za-km-z]{50}|[1-9A-HJ-NP-Za-km-z]{94})$/;

/**
 * EIP-55: a mixed-case 0x address carries a checksum in its letter casing. An
 * all-lower or all-upper address carries none (accept it); a mixed-case one
 * must match the keccak-derived casing, so a typo'd address is caught instead
 * of silently accepted. All-numeric bodies have no letters to check.
 */
function isEip55Valid(addr: string): boolean {
  const body = addr.slice(2);
  const lower = body.toLowerCase();
  if (body === lower || body === body.toUpperCase()) return true; // no checksum info
  const hash = keccak_256(new TextEncoder().encode(lower));
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if (c < 'a' || c > 'f') continue; // only letters carry checksum bits
    const nibble = hash[i >> 1];
    const bit = (i & 1) === 0 ? (nibble >> 4) & 0xf : nibble & 0xf;
    const expectUpper = bit >= 8;
    if (expectUpper !== (body[i] === body[i].toUpperCase())) return false;
  }
  return true;
}

export function detectRuntime(addr: string): DestRuntime {
  const trimmed = addr.trim();
  if (trimmed.length === 0)      return null;
  if (TZ_ADDR_RE.test(trimmed))  return 'l1';
  // A mixed-case 0x with a broken EIP-55 checksum is a typo, not an address.
  if (EVM_ADDR_RE.test(trimmed)) return isEip55Valid(trimmed) ? 'l2' : null;
  return null;
}

export function isValidAddress(addr: string): boolean {
  return detectRuntime(addr) !== null;
}

export function isValidMnemonic(mnemonic: string): boolean {
  return scureValidateMnemonic(mnemonic.trim(), englishWordlist);
}

export function isValidEdsk(sk: string): boolean {
  return EDSK_REGEX.test(sk.trim());
}

export function isValidBip39Word(word: string): boolean {
  return (englishWordlist as readonly string[]).includes(word.toLowerCase());
}
