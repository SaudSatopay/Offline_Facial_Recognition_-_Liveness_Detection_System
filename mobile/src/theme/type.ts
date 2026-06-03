// Type system. Archivo (industrial signage grotesque) for display/UI, Space Mono
// (instrument readout) for all data: metrics, scores, IDs, timestamps.
export const font = {
  black: 'Archivo_900Black',
  display: 'Archivo_800ExtraBold',
  bold: 'Archivo_700Bold',
  semibold: 'Archivo_600SemiBold',
  medium: 'Archivo_500Medium',
  regular: 'Archivo_400Regular',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

// uppercase label convention (control-panel / signage)
export const label = {
  fontFamily: font.monoBold,
  fontSize: 11,
  letterSpacing: 1.5,
  textTransform: 'uppercase' as const,
};
