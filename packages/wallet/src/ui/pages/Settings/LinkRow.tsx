import { Icon, type IconName } from '../../tx/Icon';

export function LinkRow({
  icon, t, sub, onClick,
}: {
  icon:    IconName;
  t:       string;
  sub?:    string;
  onClick?: () => void;
}) {
  return (
    <div className="tx-link-row" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <span className="i"><Icon name={icon} size={18} /></span>
      <span className="t">
        {t}
        {sub && <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', marginTop: 2 }}>{sub}</div>}
      </span>
      <span className="c"><Icon name="chevron-right" size={16} /></span>
    </div>
  );
}
