/**
 * Identicon — deterministic account avatar (mirrors mobile.css .identicon). A
 * seeded two-stop radial gradient fills the disc, with a hollow center punched
 * out (a bg-coloured inner circle). The optional `ring` paints a runtime accent
 * halo (purple for L1, cyan for L2, or a purple→cyan sweep for the unified
 * account); without a ring, a subtle surface-3 outline sits inside the edge.
 */

import Svg, { Defs, RadialGradient, LinearGradient, Stop, Circle } from 'react-native-svg';
import { colors } from '../../theme';

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Identicon({
  seed,
  size = 40,
  ring,
}: {
  seed: string;
  size?: number;
  ring?: 'l1' | 'l2';
}): React.JSX.Element {
  const h = hashCode(seed);
  const c1 = `hsl(${h % 360}, 70%, 62%)`;
  const c2 = `hsl(${(h * 7) % 360}, 72%, 55%)`;
  const cx = size / 2;
  const innerR = size * 0.22; // matches the design's inset (0.28 of half-size)
  const ringW = 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id="ic-fill" cx="0.34" cy="0.34" r="0.72">
          <Stop offset="0" stopColor={c1} />
          <Stop offset="0.72" stopColor={c2} />
          <Stop offset="1" stopColor={c2} />
        </RadialGradient>
        <LinearGradient id="ic-ring" x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.purple} />
          <Stop offset="1" stopColor={colors.cyan} />
        </LinearGradient>
      </Defs>

      <Circle cx={cx} cy={cx} r={cx} fill="url(#ic-fill)" />

      {ring != null ? (
        <Circle
          cx={cx}
          cy={cx}
          r={cx - ringW / 2}
          stroke={ring === 'l1' ? colors.purple : ring === 'l2' ? colors.cyan : 'url(#ic-ring)'}
          strokeWidth={ringW}
          fill="none"
        />
      ) : (
        <Circle cx={cx} cy={cx} r={cx - 1} stroke={colors.surface3} strokeWidth={2} fill="none" />
      )}

      <Circle cx={cx} cy={cx} r={innerR} fill={colors.bg} />
    </Svg>
  );
}
