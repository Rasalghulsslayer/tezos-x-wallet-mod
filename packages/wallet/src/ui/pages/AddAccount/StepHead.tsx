import { Icon, type IconName } from '../../tx/Icon';

/**
 * StepHead: the wizard's stage header — a source-marked glyph chip (seed /
 * key / paste / globe) beside the VM kicker and title, so every step names
 * which secret or decision it is about at a glance.
 */
export function StepHead({ icon, accent = 'purple', kicker, title, sub }: {
  icon:    IconName;
  accent?: 'purple' | 'cyan';
  kicker:  string | null;
  title:   string;
  sub?:    string;
}) {
  return (
    <div className="tx-add-step-head" style={{ paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className={`tx-stage-glyph ${accent}`} style={{ width: 32, height: 32 }}>
          <Icon name={icon} size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          {kicker != null && <div className="kicker" style={{ marginBottom: 4 }}>{kicker}</div>}
          <h2 style={{ margin: 0 }}>{title}</h2>
          {sub != null && <p className="sub" style={{ marginTop: 6 }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}
