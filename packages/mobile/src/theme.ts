/**
 * Design tokens — the RN mirror of the extension's `--tx-*` tokens
 * (packages/wallet/src/ui/styles.css), nudged up for a touch surface exactly as
 * the mobile design (mobile/mobile.css) specifies. Dark only. Purple = Michelson
 * / L1 · Cyan = EVM / L2. Reference these tokens, never inline hex.
 */

import { Platform } from 'react-native';

export const colors = {
  bg:            '#0B0B12',
  surface:       '#14141C',
  surface2:      '#1C1C26',
  surface3:      '#242432',
  border:        '#22222E',
  borderStrong:  '#343446',

  fg:            '#F4F4F7',
  fgMuted:       '#9A9AA8',
  fgSubtle:      '#65657A',
  fgInverted:    '#0B0B12',

  purple:        '#7C5CFF',
  purpleSoft:    '#5A42C2',
  purpleBg:      'rgba(124, 92, 255, 0.10)',
  purpleLine:    'rgba(124, 92, 255, 0.35)',
  purpleText:    '#B09BFF', // legible purple on dark (badges)

  cyan:          '#00C2FF',
  cyanSoft:      '#0090C2',
  cyanBg:        'rgba(0, 194, 255, 0.10)',
  cyanLine:      'rgba(0, 194, 255, 0.35)',
  cyanText:      '#66DBFF',

  success:       '#4CDE94',
  successBg:     'rgba(76, 222, 148, 0.10)',
  danger:        '#FF5D5D',
  dangerBg:      'rgba(255, 93, 93, 0.10)',
  warning:       '#FFB84C',
  warningBg:     'rgba(255, 184, 76, 0.10)',

  scrim:         'rgba(0, 0, 0, 0.6)', // modal backdrop
} as const;

/** Spacing scale (sp-1…8): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 48 } as const;

/** Radii (r-xs…pill). */
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 22, pill: 9999 } as const;

/** Type scale (fs-xs…5xl), nudged up from the popup's 13px base. */
export const fontSize = {
  xs: 12, sm: 13, md: 15, lg: 17, xl: 20, '2xl': 24, '3xl': 30, '4xl': 40, '5xl': 52,
} as const;

/** Aspekta ships in the extension via @fontsource; on RN it's system unless a
 *  bundled font is added later. Mono uses the platform's monospace face. */
export const font = {
  sans: undefined as string | undefined,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

/** iOS safe-area insets used by the shell (bottom tabs, action bars). */
export const safe = { top: 56, bottom: 30 } as const;

export type Colors = typeof colors;
