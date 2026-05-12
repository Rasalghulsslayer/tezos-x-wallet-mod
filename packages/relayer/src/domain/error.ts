/**
 * Error classes for @tezosx/relayer: RelayerError (base), GatewayError,
 * PrecompileError.
 */

export class RelayerError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = 'RelayerError';
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

export class GatewayError extends RelayerError {
  constructor(message: string, code: number, data?: unknown) {
    super(message, code, data);
    this.name = 'GatewayError';
  }
}

export class PrecompileError extends RelayerError {
  constructor(message: string, code: number, data?: unknown) {
    super(message, code, data);
    this.name = 'PrecompileError';
  }
}
