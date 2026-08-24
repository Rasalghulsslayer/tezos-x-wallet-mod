import { describe, expect, it } from 'vitest';
import {
  COST_PER_BYTE_MUTEZ,
  HARD_GAS_LIMIT_PER_OPERATION,
  HARD_STORAGE_LIMIT_PER_OPERATION,
  checkOperation,
  maxOpCostMutez,
} from '../tezos-operation';

const GATEWAY  = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';
const TZ1      = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const OK       = { destination: GATEWAY, amount: '0', entrypoint: 'call_evm' };

describe('the chain limits this module encodes', () => {
  // Read off /chains/main/blocks/head/context/constants on 2026-08-24. Pinned as
  // literals so a change to the chain fails a test rather than silently letting
  // an unincludable operation through.
  it('match previewnet', () => {
    expect(HARD_GAS_LIMIT_PER_OPERATION).toBe(660_000);
    expect(HARD_STORAGE_LIMIT_PER_OPERATION).toBe(60_000);
    expect(COST_PER_BYTE_MUTEZ).toBe(1);
  });
});

describe('checkOperation — destination', () => {
  it('accepts every address kind the ceremony targets', () => {
    // A per-role originator, a child, the gateway — all KT1 — plus a tz1 for a
    // plain transfer.
    for (const destination of [GATEWAY, 'KT1UvfhpPbdLqcqkJt6pmXQU6xPhgRseZGWG', TZ1]) {
      expect(checkOperation({ ...OK, destination }), destination).toEqual({ ok: true });
    }
  });

  it('accepts tz2, tz3 and tz4 implicit accounts', () => {
    for (const p of ['tz2', 'tz3', 'tz4']) {
      const destination = p + TZ1.slice(3);
      expect(checkOperation({ ...OK, destination }).ok, destination).toBe(true);
    }
  });

  it('refuses anything that is not a Tezos address', () => {
    for (const destination of [
      '', 'not-an-address', '0x' + '11'.repeat(20), GATEWAY.slice(0, -1), GATEWAY + 'x',
      'KT2' + GATEWAY.slice(3), ' ' + GATEWAY,
    ]) {
      const v = checkOperation({ ...OK, destination });
      expect(v.ok, destination).toBe(false);
      if (v.ok) throw new Error('unreachable');
      expect(v.reason).toMatch(/Not a Tezos address/);
    }
  });
});

describe('checkOperation — amount', () => {
  it('accepts a whole number of mutez as a string', () => {
    for (const amount of ['0', '1', '1000000', '9007199254740991']) {
      expect(checkOperation({ ...OK, amount }).ok, amount).toBe(true);
    }
  });

  it('refuses anything that is not a non-negative integer string', () => {
    // `Number(amount)` reaches Taquito, where a non-numeric string becomes NaN
    // and a decimal silently loses precision.
    for (const amount of ['', '1.5', '-1', '1e6', ' 1', '1 ', 'abc', '0x10', '+1']) {
      const v = checkOperation({ ...OK, amount });
      expect(v.ok, JSON.stringify(amount)).toBe(false);
    }
  });

  it('refuses an amount too large to represent exactly', () => {
    const v = checkOperation({ ...OK, amount: '9007199254740993' });
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error('unreachable');
    expect(v.reason).toMatch(/too large/);
  });
});

describe('checkOperation — entrypoint', () => {
  it('accepts the ceremony\'s entrypoints', () => {
    for (const entrypoint of ['call_evm', 'setAdmin', 'default', 'deploy', 'a', 'a.b_c']) {
      expect(checkOperation({ ...OK, entrypoint }).ok, entrypoint).toBe(true);
    }
  });

  it('treats an absent entrypoint as a plain transfer', () => {
    expect(checkOperation({ destination: TZ1, amount: '1' })).toEqual({ ok: true });
  });

  it('refuses a non-entrypoint', () => {
    for (const entrypoint of ['', 'has spaces', '%leading', '1starts_with_digit', 'x'.repeat(40)]) {
      expect(checkOperation({ ...OK, entrypoint }).ok, JSON.stringify(entrypoint)).toBe(false);
    }
  });
});

describe('checkOperation — limits', () => {
  it('accepts an absent pin: the wallet will price it', () => {
    expect(checkOperation({ ...OK, limits: undefined })).toEqual({ ok: true });
  });

  it('accepts the live ceremony pins', () => {
    // Measured from the dApp: the phase-2 deploy sits at the gas cap exactly, and
    // the phase-1 originator calls and phase-4 wire writes well under it.
    for (const limits of [
      { fee: 500_000, gasLimit: 660_000, storageLimit: 10_000 },  // deploy, at the cap
      { fee:  30_000, gasLimit:   6_500, storageLimit:  3_006 },  // irs originator
      { fee:  60_000, gasLimit:   9_500, storageLimit: 12_304 },  // token originator
      { fee:   5_000, gasLimit:  20_000, storageLimit: 10_000 },  // wire write
      { fee: 0, gasLimit: 0, storageLimit: 0 },
    ]) {
      expect(checkOperation({ ...OK, limits }).ok, JSON.stringify(limits)).toBe(true);
    }
  });

  it('refuses gas above the hard limit — the op could not be included at any fee', () => {
    const v = checkOperation({ ...OK, limits: { fee: 1, gasLimit: 660_001, storageLimit: 1 } });
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error('unreachable');
    expect(v.reason).toMatch(/660000/);
    expect(v.reason).toMatch(/cannot be included at any fee/);
  });

  it('refuses the wallet\'s own CALL_EVM_GAS_LIMIT, which is over the cap', () => {
    // 1_040_000 in tezos-signer.ts's call_evm fallback is 1.58× the chain's limit.
    // Recorded as a test so the number cannot be reused on this path by accident.
    expect(checkOperation({ ...OK, limits: { fee: 100_000, gasLimit: 1_040_000, storageLimit: 60_000 } }).ok)
      .toBe(false);
  });

  it('refuses storage above the hard limit', () => {
    const v = checkOperation({ ...OK, limits: { fee: 1, gasLimit: 1, storageLimit: 60_001 } });
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error('unreachable');
    expect(v.reason).toMatch(/60000/);
  });

  it('refuses a negative or fractional knob', () => {
    for (const limits of [
      { fee: -1,   gasLimit: 1,   storageLimit: 1 },
      { fee: 1,    gasLimit: -1,  storageLimit: 1 },
      { fee: 1,    gasLimit: 1,   storageLimit: -1 },
      { fee: 1.5,  gasLimit: 1,   storageLimit: 1 },
      { fee: NaN,  gasLimit: 1,   storageLimit: 1 },
      { fee: Infinity, gasLimit: 1, storageLimit: 1 },
    ]) {
      expect(checkOperation({ ...OK, limits }).ok, JSON.stringify(limits)).toBe(false);
    }
  });
});

describe('maxOpCostMutez', () => {
  it('is the fee in full plus the whole storage allowance', () => {
    // A consent figure that can be exceeded is not consent, so this is the
    // ceiling: fee is charged as declared and every allowed byte could burn.
    expect(maxOpCostMutez({ fee: 5_000, gasLimit: 20_000, storageLimit: 10_000 })).toBe(15_000);
  });

  it('excludes gas, whose cost is already inside the fee', () => {
    const a = maxOpCostMutez({ fee: 5_000, gasLimit: 1,       storageLimit: 100 });
    const b = maxOpCostMutez({ fee: 5_000, gasLimit: 660_000, storageLimit: 100 });
    expect(a).toBe(b);
  });

  it('matches the live deploy pin', () => {
    expect(maxOpCostMutez({ fee: 500_000, gasLimit: 660_000, storageLimit: 10_000 })).toBe(510_000);
  });
});
