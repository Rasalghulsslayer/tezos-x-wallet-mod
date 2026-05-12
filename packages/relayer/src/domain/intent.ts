/**
 * High-level cross-runtime user intents before encoding into a concrete
 * CrossRuntimeCall: transfer, call-michelson, call-evm.
 */

export type CrossRuntimeIntent =
  | {
      kind:        'transfer';
      destination: string;
      amount:      bigint;
    }
  | {
      kind:            'call-michelson';
      destination:     string;
      entrypoint:      string;
      binaryMicheline: string;
      value?:          bigint;
    }
  | {
      kind:         'call-evm';
      destination:  string;
      methodSig:    string;
      abiParamsHex: string;
      value?:       bigint;
    };
