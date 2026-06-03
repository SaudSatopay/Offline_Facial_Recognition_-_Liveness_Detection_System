// Shared dark palette — kept in sync with the server dashboard for a cohesive look.
export const colors = {
  bg: '#0b1020',
  surface: '#151b2e',
  surfaceAlt: '#1c2336',
  line: '#243049',
  text: '#e8edf7',
  textMut: '#8a97b3',
  primary: '#5b8cff',
  primaryDim: '#2b3c66',
  success: '#3ad29f',
  successDim: 'rgba(58,210,159,0.15)',
  danger: '#ff6b6b',
  dangerDim: 'rgba(255,107,107,0.15)',
  warn: '#ffcc66',
  warnDim: 'rgba(255,204,102,0.15)',
} as const;

export type ColorName = keyof typeof colors;
