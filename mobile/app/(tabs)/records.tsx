import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Grain, Display, Mono, Label, Tag, Ticks } from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { font } from '../../src/theme/type';
import { listAttendance, countToday, AttendanceRecord } from '../../src/db/attendance';

export default function Log() {
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [today, setToday] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => { setRows(listAttendance(300)); setToday(countToday()); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={st.screen}>
      <Grain />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={st.header}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Display size={26}>ACTIVITY LOG</Display>
            <View style={{ alignItems: 'flex-end' }}>
              <Label>Last 24h</Label>
              <Mono size={22} color={colors.amber}>{String(today).padStart(2, '0')}</Mono>
            </View>
          </View>
          <Ticks count={44} style={{ marginTop: 10, opacity: 0.5 }} />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 18, paddingTop: 6, gap: 9 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setRefreshing(false); }} tintColor={colors.amber} />}
          ListEmptyComponent={<Mono color={colors.textFaint} style={{ textAlign: 'center', marginTop: 50 }}>// no records yet</Mono>}
          renderItem={({ item }) => (
            <View style={[st.row, { borderLeftColor: item.liveness_passed ? colors.green : colors.red }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semibold, color: item.name ? colors.text : colors.textDim, fontSize: 15 }}>{item.name ?? 'Unknown face'}</Text>
                <Mono size={11} color={colors.textFaint} style={{ marginTop: 3 }}>
                  {new Date(item.timestamp).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {'  ·  '}{(item.challenge ?? '—').toUpperCase()}{item.score != null ? `  ·  ${item.score.toFixed(2)}` : ''}
                </Mono>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Tag text={item.liveness_passed ? 'LIVE' : 'SPOOF'} tone={item.liveness_passed ? 'live' : 'spoof'} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={item.synced ? 'cloud-done' : 'time-outline'} size={11} color={item.synced ? colors.textDim : colors.amberBright} />
                  <Mono size={9.5} color={item.synced ? colors.textFaint : colors.amberBright}>{item.synced ? 'SYNCED' : 'QUEUED'}</Mono>
                </View>
              </View>
            </View>
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderRadius: 8, padding: 14 },
});
