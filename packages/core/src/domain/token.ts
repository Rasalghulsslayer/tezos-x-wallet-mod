/**
 * RegisteredToken: per-account ERC-20 registry entry.
 * Pure data + error classes; no I/O. Wired by the TokenStore port.
 */

export interface TokenMetadata {
  symbol:   string;
  name:     string;
  decimals: number;
}

export interface RegisteredToken extends TokenMetadata {
  address:  string;             // lowercased
  addedAt:  number;              // ms epoch — drives Home's display order
  builtin?: boolean;             // true for the USDC seed in CT4 (cannot be removed)
}

export class TokenAlreadyRegisteredError extends Error {
  constructor(public readonly address: string, public readonly existing: RegisteredToken) {
    super(`Token ${address} already in the registry`);
    this.name = 'TokenAlreadyRegisteredError';
  }
}

export class MaxTokensReachedError extends Error {
  constructor(public readonly cap: number) {
    super(`Account already holds ${cap} tokens`);
    this.name = 'MaxTokensReachedError';
  }
}

export class NotErc20Error extends Error {
  constructor(public readonly address: string) {
    super(`${address} does not respond as an ERC-20 contract`);
    this.name = 'NotErc20Error';
  }
}

export class BuiltinTokenError extends Error {
  constructor(public readonly address: string) {
    super(`Cannot remove builtin token ${address}`);
    this.name = 'BuiltinTokenError';
  }
}
