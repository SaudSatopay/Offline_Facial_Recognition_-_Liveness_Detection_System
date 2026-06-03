// Small reusable UI kit so screens stay declarative and consistent.
import React from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ViewStyle, TextStyle, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './colors';

export function Screen({ children, scroll = true, style }: {
  children: React.ReactNode; scroll?: boolean; style?: ViewStyle;
}) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? [s.scrollContent, style] : undefined}
      >
        {children}
      </Body>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

export function StatCard({ label, value, accent = colors.text }: {
  label: string; value: string | number; accent?: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: {
  title: string; onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'success';
  disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = {
    primary: colors.primary, success: colors.success,
    danger: colors.danger, ghost: 'transparent',
  }[variant];
  const fg = variant === 'ghost' ? colors.text : '#0b1020';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && s.btnGhost,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={fg} />
        : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: {
  label: string; tone?: 'success' | 'danger' | 'warn' | 'neutral';
}) {
  const map = {
    success: [colors.successDim, colors.success],
    danger: [colors.dangerDim, colors.danger],
    warn: [colors.warnDim, colors.warn],
    neutral: [colors.surfaceAlt, colors.textMut],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export const text = (extra?: TextStyle) => [s.body, extra];
export const muted = (extra?: TextStyle) => [s.muted, extra];

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 18, paddingBottom: 40, gap: 14 },
  card: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.line, gap: 10,
  },
  section: {
    color: colors.textMut, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6,
  },
  stat: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  statLabel: { color: colors.textMut, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  btn: {
    paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: colors.line },
  btnText: { fontWeight: '700', fontSize: 15 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { color: colors.text, fontSize: 15 },
  muted: { color: colors.textMut, fontSize: 13 },
});
