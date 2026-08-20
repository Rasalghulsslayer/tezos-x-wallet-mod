import type { TxStatus } from '@tezosx/wallet-core/domain/tx-status';
import { TEZOS_EXPLORER, EVM_EXPLORER } from '@tezosx/wallet-core/shared/constants';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Icon } from './Icon';

interface Props {
  status:  TxStatus;
  runtime: 'l1' | 'l2';
  hash:    string;
}

export function StatusMeta({ status, runtime, hash }: Props) {
  const explorerUrl =
    runtime === 'l1'
      ? `${TEZOS_EXPLORER}/${hash}`
      : `${EVM_EXPLORER}/tx/${hash}`;
  const explorerName = runtime === 'l1' ? 'tzkt' : 'blockscout';

  const blockLevel =
    status.stage === 'included' || status.stage === 'finalized'
      ? status.blockLevel
      : null;
  const isFinalized = status.stage === 'finalized';

  return (
    <div className="tx-status-meta">
      <div className="tx-status-meta-row">
        <span className="k">Hash</span>
        <a className="v link" href={explorerUrl} target="_blank" rel="noopener noreferrer">
          {shortAddr(hash, 5, 4)}
          <Icon name="external-link" size={11} />
        </a>
      </div>
      <div className="tx-status-meta-row">
        <span className="k">Block</span>
        <span className="v">
          {blockLevel != null
            ? `#${blockLevel.toLocaleString()}`
            : <span className="pending">pending</span>}
        </span>
      </div>
      {isFinalized && (
        <div className="tx-status-meta-row">
          <span className="k">View</span>
          <a className="v link" href={explorerUrl} target="_blank" rel="noopener noreferrer">
            {explorerName}
            <Icon name="external-link" size={11} />
          </a>
        </div>
      )}
    </div>
  );
}
