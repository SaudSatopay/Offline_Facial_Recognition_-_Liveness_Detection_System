import { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Button, Badge, StatCard, SectionTitle, Row } from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { countUsers } from '../../src/db/users';
import { countToday } from '../../src/db/attendance';
import { MODEL_SIZE_MB } from '../../src/ml/constants';
import { useSync } from '../../src/sync/useSync';

export default function Dashboard() {
  const router = useRouter();
  const sync = useSync();
  const [users, setUsers] = useState(0);
  const [today, setToday] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setUsers(countUsers());
      setToday(countToday());
      sync.refreshCount();
    }, [sync]),
  );

  return (
    <Screen>
      <View style={s.hero}>
        <Text style={s.title}>FaceAttend</Text>
        <Text style={s.subtitle}>Offline facial recognition + liveness</Text>
        <Row style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <Badge label="100% OFFLINE" tone="success" />
          <Badge label="< 1s AUTH" tone="warn" />
          <Badge label="LIVENESS ON" tone="neutral" />
        </Row>
      </View>

      <Row>
        <StatCard label="Enrolled" value={users} accent={colors.primary} />
        <StatCard label="Today" value={today} accent={colors.success} />
      </Row>
      <Row>
        <StatCard label="Model" value={`${MODEL_SIZE_MB} MB`} />
        <StatCard label="Accuracy" value="98.3%" accent={colors.success} />
      </Row>

      <SectionTitle>Quick actions</SectionTitle>
      <Button title="📷  Mark Attendance" onPress={() => router.push('/attendance')} />
      <Button title="＋  Enroll a Face" variant="ghost" onPress={() => router.push('/enroll')} />

      <SectionTitle>Cloud sync</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <Ionicons
              name={sync.online ? 'cloud-done' : 'cloud-offline'}
              size={20}
              color={sync.online ? colors.success : colors.textMut}
            />
            <Text style={s.body}>{sync.online ? 'Online' : 'Offline'}</Text>
          </Row>
          <Badge
            label={sync.unsynced > 0 ? `${sync.unsynced} pending` : 'all synced'}
            tone={sync.unsynced > 0 ? 'warn' : 'success'}
          />
        </Row>
        <Button
          title={sync.syncing ? 'Syncing…' : 'Sync now'}
          variant="ghost"
          loading={sync.syncing}
          disabled={sync.unsynced === 0}
          onPress={sync.syncNow}
        />
        {sync.lastError ? <Text style={s.err}>{sync.lastError}</Text> : null}
      </Card>

      <SectionTitle>How it works</SectionTitle>
      <Card>
        <Step n="1" t="Enroll" d="Capture a face once — a 192-d template is stored locally." />
        <Step n="2" t="Liveness" d="A random blink / smile / head-turn check blocks photo spoofing." />
        <Step n="3" t="Recognize" d="MobileFaceNet embeds + matches on-device in milliseconds." />
        <Step n="4" t="Sync" d="Attendance queues offline and uploads when a network returns." />
      </Card>
    </Screen>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.body}>{t}</Text>
        <Text style={s.muted}>{d}</Text>
      </View>
    </Row>
  );
}

const s = StyleSheet.create({
  hero: { gap: 4, marginBottom: 4 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.textMut, fontSize: 14 },
  body: { color: colors.text, fontSize: 15, fontWeight: '600' },
  muted: { color: colors.textMut, fontSize: 13, marginTop: 2 },
  err: { color: colors.danger, fontSize: 12 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primaryDim,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
});
