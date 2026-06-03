// "Field terminal" UI kit. Sharp corners, hairline rules, targeting brackets,
// instrument-style mono data, amber signal gradients, grain texture, and
// staggered entrance motion. Built on RN primitives + expo-linear-gradient.
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ViewStyle, TextStyle,
  Animated, ActivityIndicator, Image, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, gradients } from './colors';
import { font, label as labelType } from './type';

const GRAIN = require('../../assets/textures/grain.png');

// ---------------------------------------------------------------- layout
export function Grain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <View style={[StyleSheet.absoluteFillObject, { opacity, pointerEvents: 'none' }]}>
      <Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFillObject} />
    </View>
  );
}

export function Screen({ children, scroll = true, pad = true, style }: {
  children: React.ReactNode; scroll?: boolean; pad?: boolean; style?: ViewStyle;
}) {
  const Body: any = scroll ? ScrollView : View;
  return (
    <View style={st.screen}>
      <Grain />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Body
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={scroll ? [pad && st.scrollPad, style] : [{ flex: 1 }, pad && st.scrollPad, style]}
        >
          {children}
        </Body>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------- text
export function Display({ children, size = 32, style }: { children: React.ReactNode; size?: number; style?: TextStyle }) {
  return <Text style={[{ fontFamily: font.display, color: colors.text, fontSize: size, letterSpacing: -0.5 }, style]}>{children}</Text>;
}
export function Heading({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[{ fontFamily: font.bold, color: colors.text, fontSize: 17 }, style]}>{children}</Text>;
}
export function Body({ children, dim, style }: { children: React.ReactNode; dim?: boolean; style?: TextStyle }) {
  return <Text style={[{ fontFamily: font.regular, color: dim ? colors.textDim : colors.text, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}
export function Mono({ children, size = 13, color = colors.textDim, style }: { children: React.ReactNode; size?: number; color?: string; style?: TextStyle }) {
  return <Text style={[{ fontFamily: font.mono, color, fontSize: size }, style]}>{children}</Text>;
}
export function Label({ children, color = colors.textFaint, style }: { children: React.ReactNode; color?: string; style?: TextStyle }) {
  return <Text style={[labelType, { color }, style]}>{children}</Text>;
}

// ---------------------------------------------------------------- decoration
export function Corners({ color = colors.amber, len = 18, thick = 2, inset = -1 }: {
  color?: string; len?: number; thick?: number; inset?: number;
}) {
  const base: ViewStyle = { position: 'absolute', width: len, height: len, borderColor: color };
  return (
    <>
      <View style={[base, { top: inset, left: inset, borderTopWidth: thick, borderLeftWidth: thick }]} />
      <View style={[base, { top: inset, right: inset, borderTopWidth: thick, borderRightWidth: thick }]} />
      <View style={[base, { bottom: inset, left: inset, borderBottomWidth: thick, borderLeftWidth: thick }]} />
      <View style={[base, { bottom: inset, right: inset, borderBottomWidth: thick, borderRightWidth: thick }]} />
    </>
  );
}

export function Ticks({ count = 28, color = colors.line, style }: { count?: number; color?: string; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', height: 10, gap: 3, overflow: 'hidden' }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: 1.5, height: i % 4 === 0 ? 10 : 5, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function Pulse({ color = colors.green, size = 8 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 1100, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])).start();
  }, [a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color, opacity, transform: [{ scale }] }} />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

// staggered entrance: fade + rise on mount
export function Stagger({ children, index = 0, style }: { children: React.ReactNode; index?: number; style?: ViewStyle }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 420, delay: 60 + index * 70, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
  }, [a, index]);
  return (
    <Animated.View style={[{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------- containers
export function Field({ children, accent, style }: { children: React.ReactNode; accent?: string; style?: ViewStyle }) {
  return (
    <View style={[st.field, style]}>
      {accent ? <View style={[st.accentEdge, { backgroundColor: accent }]} /> : null}
      {children}
    </View>
  );
}

export function Divider({ label, style }: { label?: string; style?: ViewStyle }) {
  if (!label) return <View style={[st.hr, style]} />;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>
      <Label>{label}</Label>
      <View style={[st.hr, { flex: 1 }]} />
    </View>
  );
}

// ---------------------------------------------------------------- data viz
export function StatTile({ k, v, accent = colors.text, mono = true }: { k: string; v: string | number; accent?: string; mono?: boolean }) {
  return (
    <View style={st.stat}>
      <Label>{k}</Label>
      <Text style={{ fontFamily: mono ? font.monoBold : font.display, color: accent, fontSize: 28, marginTop: 6 }}>{v}</Text>
      <Ticks count={10} style={{ marginTop: 8, opacity: 0.6 }} />
    </View>
  );
}

export function Meter({ value, color = colors.amber, height = 6 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, backgroundColor: colors.surfaceAlt, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Tag({ text, tone = 'neutral' }: { text: string; tone?: 'live' | 'spoof' | 'warn' | 'neutral' | 'amber' }) {
  const map = {
    live: [colors.greenDim, colors.green],
    spoof: [colors.redDim, colors.red],
    warn: [colors.amberDim, colors.amberBright],
    amber: [colors.amberDim, colors.amber],
    neutral: [colors.surfaceAlt, colors.textDim],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[st.tag, { backgroundColor: bg }]}>
      <Text style={{ fontFamily: font.monoBold, fontSize: 10.5, letterSpacing: 1, color: fg, textTransform: 'uppercase' }}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- buttons
export function GradientButton({ title, onPress, disabled, loading, style, icon }: {
  title: string; onPress?: () => void; disabled?: boolean; loading?: boolean; style?: ViewStyle; icon?: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        disabled={disabled || loading}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress?.(); }}
        style={{ opacity: disabled ? 0.45 : 1 }}
      >
        <LinearGradient colors={gradients.amber} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.gbtn}>
          {loading ? <ActivityIndicator color={colors.black} /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {icon}
              <Text style={st.gbtnText}>{title}</Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function GhostButton({ title, onPress, disabled, loading, tone = 'neutral', style }: {
  title: string; onPress?: () => void; disabled?: boolean; loading?: boolean; tone?: 'neutral' | 'danger'; style?: ViewStyle;
}) {
  const c = tone === 'danger' ? colors.red : colors.text;
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => { Haptics.selectionAsync(); onPress?.(); }}
      style={({ pressed }) => [st.ghost, { borderColor: tone === 'danger' ? colors.red : colors.lineBright, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={c} /> : <Text style={[st.ghostText, { color: c }]}>{title}</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollPad: { padding: 18, paddingBottom: 36, gap: 14 },
  field: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12, overflow: 'hidden' },
  accentEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  hr: { height: 1, backgroundColor: colors.line },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 14 },
  tag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start' },
  gbtn: { paddingVertical: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  gbtnText: { fontFamily: font.bold, fontSize: 15, color: colors.black, letterSpacing: 0.3 },
  ghost: { paddingVertical: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: font.semibold, fontSize: 14.5 },
});
