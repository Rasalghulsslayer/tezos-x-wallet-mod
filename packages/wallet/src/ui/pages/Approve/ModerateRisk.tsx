import { Icon } from '../../tx/Icon';

export function ModerateRisk({ msg }: { msg: string }) {
  return (
    <div className="tx-risk med" style={{ marginBottom: 14 }}>
      <Icon name="alert" size={16} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>Moderate risk</div>
        <div style={{ fontSize: 11, opacity: 0.9 }}>{msg}</div>
      </div>
      <span className="bars">
        <span className="on" /><span className="on" /><span />
      </span>
    </div>
  );
}
