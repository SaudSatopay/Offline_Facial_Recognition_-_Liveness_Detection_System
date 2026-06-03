// "Field terminal" palette — warm near-black charcoal with a hi-vis amber signal
// accent (highway-signage heritage). Deliberately NOT the generic blue-black dark
// theme. Verified-green and alert-red are sharp accents, never dominant.
export const colors = {
  bg: '#100F0C',
  bgElev: '#16140F',
  surface: '#1B1913',
  surfaceAlt: '#232019',
  line: '#332E23',
  lineBright: '#4A4231',
  text: '#F6EDD9',
  textDim: '#B7AD95',
  textFaint: '#7C7360',

  amber: '#FFB100',
  amberBright: '#FFC53D',
  ember: '#FF7A00',
  emberDeep: '#C2410C',
  amberDim: 'rgba(255,177,0,0.13)',

  green: '#5CE49B',
  greenDim: 'rgba(92,228,155,0.14)',
  red: '#FF5A52',
  redDim: 'rgba(255,90,82,0.14)',
  black: '#0A0908',
} as const;

export const gradients = {
  amber: ['#FFC53D', '#FF7A00'] as const,   // primary action
  ember: ['#FF7A00', '#C2410C'] as const,
  surface: ['#211E17', '#16140F'] as const, // card depth
  veil: ['rgba(16,15,12,0)', 'rgba(16,15,12,0.92)'] as const, // camera bottom veil
} as const;

export type ColorName = keyof typeof colors;
