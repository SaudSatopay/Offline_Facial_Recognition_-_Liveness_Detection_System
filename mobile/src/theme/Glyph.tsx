// Minimal, stateless icon renderer — a drop-in for @expo/vector-icons' <Ionicons>.
//
// @expo/vector-icons' Icon component gates rendering on a stateful
// `Font.isLoaded('ionicons')` check that gets stuck "false" in this prebuilt
// release (icons stay blank even once the font is loaded). This renders the
// glyph directly as <Text> with the loaded "ionicons" font, so it shows as soon
// as the font resolves (the font is loaded in app/_layout via useFonts).
import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';

const MAP = glyphMap as Record<string, number>;

export function Glyph({ name, size = 24, color = '#fff', style }: {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const cp = MAP[name];
  return (
    <Text
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      style={[{ fontFamily: 'ionicons', fontSize: size, color, lineHeight: size + 2 }, style]}
    >
      {cp != null ? String.fromCodePoint(cp) : ''}
    </Text>
  );
}

// Alias so screens can `import { Glyph as Ionicons }` and keep their JSX.
export default Glyph;
