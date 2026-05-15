/**
 * Ethereum-shaped request and receipt types used by the EIP-1193 surface.
 */

export interface EthTransactionRequest {
  from?:     string;
  to:        string;
  data?:     string;
  value?:    string;
  gas?:      string;
  gasPrice?: string;
}

export interface EthTransactionReceipt {
  transactionHash:    string;
  transactionIndex:   string;
  blockHash:          string;
  blockNumber:        string;
  from:               string;
  to:                 string | null;
  contractAddress:    string | null;
  cumulativeGasUsed:  string;
  gasUsed:            string;
  effectiveGasPrice:  string;
  logs:               unknown[];
  logsBloom:          string;
  status:             string;
  type:               string;
}
