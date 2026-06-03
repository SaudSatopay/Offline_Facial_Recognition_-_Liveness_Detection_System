import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Screen, Field, Display, Heading, Body, Mono, Label, Tag, StatTile,
  Corners, Ticks, Pulse, Stagger, GradientButton, Divider,
} from '../../src/theme/ui';
import { colors, gradients } from '../../src/theme/colors';
import { font } from '../../src/theme/type';
import { countUsers } from '../../src/db/users';
import { countToday, listAttendance, AttendanceRecord } from '../../src/db/attendance';
import { MODEL_SIZE_MB } from '../../src/ml/constants';
import { useSync } from '../../src/sync/useSync';

export default function Status() {
  const router = useRouter();
  const sync = useSync();
  const [users, setUsers] = useState(0);
  const [today, setToday] = useState(0);
  const [recent, setRecent] = useState<AttendanceRecord[]>([]);

  useFocusEffect(useCallback(() => {
    setUsers(countUsers());
    setToday(countToday());
    setRecent(listAttendance(4));
    sync.refreshCount();
  }, [sync]));

  return (
    <Screen>
      {/* terminal header */}
      <Stagger index={0}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={s.mark}><Corners color={colors.amber} len={9} thick={2} inset={3} /></View>
            <Display size={26}>FACE<Text style={{ color: colors.amber }}>ATTEND</Text></Display>
          </View>
          <View style={s.sysline}>
            <Pulse color={colors.green} size={7} />
            <Mono size={11} color={colors.textDim}>SYS // OFFLINE-READY // MODEL OK</Mono>
          </View>
        </View>
      </Stagger>

      {/* primary scan CTA */}
      <Stagger index={1}>
        <Pressable onPress={() => router.push('/attendance')}>
          <View style={s.cta}>
            <Corners color={colors.amber} len={22} thick={2} inset={8} />
            <LinearGradient colors={['rgba(255,122,0,0.18)', 'rgba(255,122,0,0.02)']} style={StyleSheet.absoluteFill} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 4 }}>
                <Label color={colors.amber}>Begin verification</Label>
                <Heading style={{ fontSize: 22 }}>Scan a face</Heading>
                <Body dim>Liveness check → on-device match</Body>
              </View>
              <View style={s.scanIcon}>
                <Ionicons name="scan" size={30} color={colors.amber} />
              </View>
            </View>
          </View>
        </Pressable>
      </Stagger>

      {/* stat grid */}
      <Stagger index={2}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile k="Enrolled" v={pad(users)} accent={colors.text} />
          <StatTile k="Today" v={pad(today)} accent={colors.green} />
        </View>
      </Stagger>
      <Stagger index={3}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile k="Model" v={`${MODEL_SIZE_MB}MB`} accent={colors.amber} />
          <StatTile k="Accuracy" v="98.3%" accent={colors.green} />
        </View>
      </Stagger>

      {/* sync */}
      <Stagger index={4}>
        <Field accent={sync.online ? colors.green : colors.textFaint}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name={sync.online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={18} color={sync.online ? colors.green : colors.textDim} />
              <Mono color={colors.text}>{sync.online ? 'CLOUD ONLINE' : 'CLOUD OFFLINE'}</Mono>
            </View>
            <Tag text={sync.unsynced > 0 ? `${sync.unsynced} QUEUED` : 'SYNCED'} tone={sync.unsynced > 0 ? 'warn' : 'live'} />
          </View>
        </Field>
      </Stagger>

      {/* recent activity */}
      <Stagger index={5}>
        <Divider label="Recent activity" />
        {recent.length === 0 ? (
          <Mono color={colors.textFaint} style={{ paddingVertical: 8 }}>// no scans yet — tap "Scan a face"</Mono>
        ) : recent.map((r) => (
          <View key={r.id} style={s.recentRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.semibold, color: r.name ? colors.text : colors.textDim, fontSize: 14 }}>{r.name ?? 'Unknown'}</Text>
              <Mono size={11} color={colors.textFaint}>{time(r.timestamp)} · {(r.challenge ?? '—').toUpperCase()}</Mono>
            </View>
            <Tag text={r.liveness_passed ? 'LIVE' : 'SPOOF'} tone={r.liveness_passed ? 'live' : 'spoof'} />
          </View>
        ))}
      </Stagger>

      {/* manage people */}
      <Stagger index={6}>
        <Pressable onPress={() => router.push('/people')} style={s.peopleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="people-outline" size={18} color={colors.amber} />
            <Mono color={colors.text}>MANAGE ENROLLED ({users})</Mono>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      </Stagger>

      <Ticks count={40} style={{ marginTop: 8, opacity: 0.5 }} />
    </Screen>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const s = StyleSheet.create({
  header: { gap: 10, marginBottom: 2 },
  mark: { width: 22, height: 22 },
  sysline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cta: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.lineBright, padding: 20, overflow: 'hidden' },
  scanIcon: { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.amber, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.amberDim },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 13 },
  peopleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 15 },
});
