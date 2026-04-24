import { Icon } from './Icon';
import { ChainPill } from './ChainPill';

export interface ActivityItem {
  dir:    'in' | 'out';
  asset:  string;
  amt:    number;
  usd?:   number;
  chain:  'l1' | 'l2';
  when:   string;
  note?:  string;
}

export function ActivityRow({ a, onClick }: { a: ActivityItem; onClick?: () => void }) {
  const positive = a.dir === 'in';
  return (
    <div className="tx-activity" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className={`ico ${a.dir}`}>
        <Icon name={positive ? 'arrow-down-left' : 'arrow-up-right'} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t">
          {positive ? 'Received' : 'Sent'} {a.asset.toUpperCase()}{a.note ? ` · ${a.note}` : ''}
        </div>
        <div className="s" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChainPill chain={a.chain} />
          <span>{a.when}</span>
        </div>
      </div>
      <div className="r">
        <div className={`a ${positive ? 'pos' : 'neg'}`}>
          {positive ? '+' : '−'}{a.amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {a.asset.toUpperCase()}
        </div>
        {a.usd != null && <div className="u">${a.usd.toFixed(2)}</div>}
      </div>
    </div>
  );
}
