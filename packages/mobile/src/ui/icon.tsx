/**
 * Icon — the mobile design's single stroke-based icon set (mirrors
 * mobile/lib.jsx ICON_PATHS). One 24×24 viewBox path per name, rendered with
 * react-native-svg. Stroke-only: round caps/joins, no fill. `color` defaults to
 * the current foreground so callers pass a theme token when they need an accent.
 */

import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

const ICON_PATHS = {
  'arrow-right':     'M4 12h15m-6-6 6 6-6 6',
  'arrow-up-right':  'M7 17 17 7m0 0H8m9 0v9',
  'arrow-down-left': 'M17 7 7 17m0 0h9m-9 0V8',
  'chevron-right':   'm9 6 6 6-6 6',
  'chevron-left':    'm15 6-6 6 6 6',
  'chevron-down':    'm6 9 6 6 6-6',
  refresh:           'M21 12a9 9 0 1 1-2.64-6.36M21 4v4h-4',
  lock:              'M8 11V8a4 4 0 0 1 8 0v3 M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z M12 15v2',
  settings:          'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  info:              'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16v-4 M12 8h.01',
  plus:              'M12 5v14M5 12h14',
  'external-link':   'M14 5h5v5m0-5L11 13M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4',
  eye:               'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z',
  'eye-off':         'M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.5 5-1.3M3 3l18 18',
  copy:              'M9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3M4 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z',
  check:             'M20 6 9 17l-5-5',
  shield:            'M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3z',
  alert:             'M12 8v5m0 3h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  home:              'M4 11 12 4l8 7M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9',
  link:              'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  wallet:            'M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11m1 9h.01',
  globe:             'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z',
  x:                 'M6 6l12 12M18 6 6 18',
  scan:              'M4 8V5a1 1 0 0 1 1-1h3M4 16v3a1 1 0 0 0 1 1h3m8-16h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3M4 12h16',
  list:              'M4 7h16M4 12h16M4 17h10',
  grid:              'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 13h6v6h-6z',
  send:              'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  key:               'M15 7a4 4 0 1 1-4 4l-6 6v3h3l1-1v-2h2v-2h2l1-1',
  trash:             'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6',
  code:              'm8 7-5 5 5 5M16 7l5 5-5 5',
  pen:               'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  size = 20,
  color = colors.fg,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={ICON_PATHS[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
