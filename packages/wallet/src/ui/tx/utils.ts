/**
 * Canonical copy for a tz1 account's EVM alias that has not been resolved yet
 * (first unlock of the account, or offline). Every surface showing a missing
 * alias must render this — never an empty string masquerading as an address.
 */
export const RESOLVING_EVM_ADDRESS = 'Resolving EVM address…';
