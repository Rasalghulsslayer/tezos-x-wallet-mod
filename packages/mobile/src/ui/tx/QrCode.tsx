/**
 * QrCode — a deterministic QR-style visual (mirrors mobile.css .qr + the canvas
 * routine in mobile/ui.jsx). This is a mock: a seeded 25×25 module grid with the
 * three finder squares, not a decodable code. Same seeded LCG as the design so a
 * given value always renders the same pattern.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors, radius } from '../../theme';

const N = 25;
const CANVAS = 200;
const PX = CANVAS / N;
const DARK = colors.bg; // dark QR modules on the white quiet zone

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildCells(value: string): { x: number; y: number; w: number; h: number }[] {
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  let h = hashCode(value) || 1;
  const rnd = (): number => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const finder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
      if (finder) continue;
      if (rnd() > 0.52) cells.push({ x: x * PX, y: y * PX, w: PX, h: PX });
    }
  }
  const drawFinder = (ox: number, oy: number): void => {
    cells.push({ x: ox, y: oy, w: PX * 7, h: PX });
    cells.push({ x: ox, y: oy + PX * 6, w: PX * 7, h: PX });
    cells.push({ x: ox, y: oy, w: PX, h: PX * 7 });
    cells.push({ x: ox + PX * 6, y: oy, w: PX, h: PX * 7 });
    cells.push({ x: ox + PX * 2, y: oy + PX * 2, w: PX * 3, h: PX * 3 });
  };
  drawFinder(0, 0);
  drawFinder(PX * (N - 7), 0);
  drawFinder(0, PX * (N - 7));
  return cells;
}

export function QrCode({ value }: { value: string }): React.JSX.Element {
  const cells = buildCells(value);
  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
        {cells.map((c, i) => (
          <Rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} fill={DARK} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
});
