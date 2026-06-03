import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { listAttendance, AttendanceRecord } from '../../src/db/attendance';

export default function Records() {
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => setRows(listAttendance(200)), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Text style={s.title}>Attendance log</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 18, paddingTop: 8, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); setRefreshing(false); }}
            tintColor={colors.textMut}
          />
        }
        ListEmptyComponent={
          <Text style={s.empty}>No attendance yet. Mark attendance from the Attend tab.</Text>
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name ?? 'Unknown face'}</Text>
              <Text style={s.meta}>
                {new Date(item.timestamp).toLocaleString()} · {item.challenge ?? '—'}
                {item.score != null ? ` · ${item.score.toFixed(2)}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Badge label={item.liveness_passed ? 'LIVE ✓' : 'spoof ✗'} tone={item.liveness_passed ? 'success' : 'danger'} />
              <Badge label={item.synced ? 'synced' : 'pending'} tone={item.synced ? 'neutral' : 'warn'} />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', paddingHorizontal: 18, paddingTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 14, padding: 14,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMut, fontSize: 12, marginTop: 3 },
  empty: { color: colors.textMut, textAlign: 'center', marginTop: 40 },
});
