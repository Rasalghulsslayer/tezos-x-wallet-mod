/**
 * Dark-theme palette for the mobile UI — the RN equivalent of the extension's
 * --tx-* design tokens (purple = Michelson/L1, cyan = EVM/L2). Dark only.
 */
export const colors = {
  bg:      '#0e0b16',
  surface: '#1a1626',
  border:  '#2a2438',
  fg:      '#f4f1fb',
  fgMuted: '#9b91b8',
  purple:  '#a78bfa', // L1 / Michelson accent
  cyan:    '#22d3ee', // L2 / EVM accent
  danger:  '#ff6b6b',
  success: '#4ade80',
  scrim:   'rgba(0,0,0,0.6)', // modal backdrop
} as const;
