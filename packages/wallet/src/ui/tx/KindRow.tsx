import { Icon } from './Icon';

/**
 * KindRow: the Welcome screen's full-width runtime selector — an accent spine
 * on the left edge, a glyph chip (tz1 / 0x), and a check that fills with the
 * runtime's accent. The row form keeps the choice and its consequence (the
 * tinted CTA below) in one vertical line on the narrow popup.
 */
export function KindRow({
  accent, glyph, title, detail, selected, onClick,
}: {
  accent:   'purple' | 'cyan';
  glyph:    string;
  title:    string;
  detail:   string;
  selected: boolean;
  onClick:  () => void;
}) {
  return (
    <button type="button" className={`tx-kind-row ${accent}`} aria-pressed={selected} onClick={onClick}>
      <span className="spine" />
      <span className="gl">{glyph}</span>
      <span className="body">
        <span className="t">{title}</span>
        <span className="d">{detail}</span>
      </span>
      <span className={`tx-ck${selected ? ' on' : ''} ${accent}`}><Icon name="check" size={12} strokeWidth={2.4} /></span>
    </button>
  );
}
