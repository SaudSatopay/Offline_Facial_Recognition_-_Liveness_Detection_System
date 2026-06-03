import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Grain, Mono, Label, Tag, Display, GradientButton } from '../src/theme/ui';
import { colors } from '../src/theme/colors';
import { font } from '../src/theme/type';
import { listUsers, deleteUser, User } from '../src/db/users';

export default function People() {
  const router = useRouter();
  const [rows, setRows] = useState<User[]>([]);
  const load = useCallback(() => setRows(listUsers()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (u: User) => Alert.alert('Remove enrollment', `Delete ${u.name}'s face template?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteUser(u.id); load(); } },
  ]);

  return (
    <View style={st.screen}>
      <Grain />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={st.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={st.back}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
          <Display size={22}>ENROLLED</Display>
          <View style={st.countPill}><Mono size={13} color={colors.amber}>{String(rows.length).padStart(2, '0')}</Mono></View>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 18, paddingTop: 8, gap: 9 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50, gap: 14 }}>
              <Ionicons name="person-add-outline" size={36} color={colors.textFaint} />
              <Mono color={colors.textFaint}>// no one enrolled yet</Mono>
              <GradientButton title="ENROL A FACE" onPress={() => router.push('/enroll')} style={{ width: 200 }} />
            </View>
          }
          renderItem={({ item }) => (
            <View style={st.row}>
              <View style={st.avatar}><Text style={st.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.semibold, color: colors.text, fontSize: 15.5 }}>{item.name}</Text>
                <Mono size={11} color={colors.textFaint} style={{ marginTop: 2 }}>ENROLLED {new Date(item.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</Mono>
              </View>
              <Tag text={item.synced ? 'SYNCED' : 'LOCAL'} tone={item.synced ? 'neutral' : 'warn'} />
              <Pressable onPress={() => remove(item)} hitSlop={10} style={st.trash}><Ionicons name="trash-outline" size={18} color={colors.red} /></Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: colors.line },
  countPill: { marginLeft: 'auto', borderWidth: 1, borderColor: colors.amber, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12 },
  avatar: { width: 42, height: 42, borderRadius: 8, backgroundColor: colors.amberDim, borderWidth: 1, borderColor: colors.amber, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colors.amber },
  trash: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
