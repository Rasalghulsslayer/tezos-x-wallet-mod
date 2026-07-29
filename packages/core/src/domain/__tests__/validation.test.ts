import { describe, expect, it } from 'vitest';
import { detectRuntime, isValidAddress } from '../validation';

// Canonical EIP-55 vector.
const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('detectRuntime / isValidAddress — EIP-55 (UX-8)', () => {
  it('accepts a correctly checksummed mixed-case 0x address', () => {
    expect(detectRuntime(CHECKSUMMED)).toBe('l2');
  });

  it('accepts an all-lower and an all-upper 0x address (no checksum info)', () => {
    expect(detectRuntime(CHECKSUMMED.toLowerCase())).toBe('l2');
    expect(detectRuntime('0x' + CHECKSUMMED.slice(2).toUpperCase())).toBe('l2');
  });

  it('rejects a mixed-case 0x address whose checksum is wrong (a typo)', () => {
    // Flip one letter's case → checksum no longer matches.
    const broken = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    expect(detectRuntime(broken)).toBeNull();
    expect(isValidAddress(broken)).toBe(false);
  });

  it('still detects tz1/KT1 and rejects junk', () => {
    expect(detectRuntime('tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb')).toBe('l1');
    expect(detectRuntime('0x1234')).toBeNull();
    expect(detectRuntime('nonsense')).toBeNull();
  });
});
