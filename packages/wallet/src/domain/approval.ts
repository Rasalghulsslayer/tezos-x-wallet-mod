/**
 * Approval: dApp-initiated request awaiting user decision. Variants:
 * ConnectionApproval (origin permission), TransactionApproval
 * (eth_sendTransaction), SignatureApproval (personal_sign /
 * signTypedData; populated in W4).
 */

export interface ConnectionApproval {
  kind:      'connect';
  requestId: string;
  origin:    string;
  createdAt: number;
}

export interface TransactionApproval {
  kind:       'transaction';
  requestId:  string;
  origin:     string;
  to:         string;
  value:      string;
  data:       string;
  methodSig?: string;
  createdAt:  number;
}

export interface SignatureApproval {
  kind:      'signature';
  requestId: string;
  origin:    string;
  payload:   string;
  scheme:    'personal_sign' | 'typed_data_v4';
  createdAt: number;
}

export type Approval = ConnectionApproval | TransactionApproval | SignatureApproval;
