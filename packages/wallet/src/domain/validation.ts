/**
 * Input validators and address-shape detection: detectRuntime,
 * isValidAddress, isValidMnemonic, isValidEdsk, isValidBip39Word.
 */

import { validateMnemonic as scureValidateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import type { DestRuntime } from './chain';

const TZ_ADDR_RE  = /^(tz[1234]|KT1)[a-zA-Z0-9]{33}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const EDSK_REGEX  = /^edsk(?:[1-9A-HJ-NP-Za-km-z]{50}|[1-9A-HJ-NP-Za-km-z]{94})$/;

export function detectRuntime(addr: string): DestRuntime {
  const trimmed = addr.trim();
  if (trimmed.length === 0)      return null;
  if (TZ_ADDR_RE.test(trimmed))  return 'l1';
  if (EVM_ADDR_RE.test(trimmed)) return 'l2';
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
