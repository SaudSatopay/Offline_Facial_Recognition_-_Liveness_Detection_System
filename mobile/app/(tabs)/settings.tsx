import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, Card, Button, Badge, Row, SectionTitle } from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { getSettings, updateSettings } from '../../src/config';
import { checkHealth } from '../../src/sync/client';
import { getDb } from '../../src/db/database';
import { MODEL_INPUT, EMBED_DIM, MODEL_SIZE_MB } from '../../src/ml/constants';
import { useSync } from '../../src/sync/useSync';

export default function Settings() {
  const sync = useSync();
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [threshold, setThreshold] = useState(0.45);
  const [deviceId, setDeviceId] = useState('');
  const [testing, setTesting] = useState(false);

  useFocusEffect(useCallback(() => {
    const s = getSettings();
    setServerUrl(s.serverUrl); setApiKey(s.apiKey);
    setThreshold(s.threshold); setDeviceId(s.deviceId);
  }, []));

  const save = () => {
    updateSettings({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim(), threshold });
    Alert.alert('Saved', 'Settings updated.');
  };

  const test = async () => {
    setTesting(true);
    const ok = await checkHealth(serverUrl.trim());
    setTesting(false);
    Alert.alert(ok ? 'Connected ✓' : 'No connection', ok ? `${serverUrl} is reachable.` : `Could not reach ${serverUrl}.`);
  };

  const adjust = (d: number) => setThreshold((t) => Math.min(0.7, Math.max(0.3, +(t + d).toFixed(2))));

  const clearData = () => {
    Alert.alert('Clear all data', 'Delete all enrolled faces and attendance records on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          getDb().execSync('DELETE FROM users; DELETE FROM attendance;');
          Alert.alert('Cleared', 'Local data removed.');
          sync.refreshCount();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Text style={s.title}>Settings</Text>

      <SectionTitle>Cloud sync server</SectionTitle>
      <Card>
        <Text style={s.label}>Server URL</Text>
        <TextInput value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none"
          placeholder="http://192.168.x.x:4000" placeholderTextColor={colors.textMut} style={s.input} />
        <Text style={s.hint}>Physical device: your computer’s LAN IP. Emulator: http://10.0.2.2:4000</Text>
        <Text style={s.label}>API key</Text>
        <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none"
          placeholderTextColor={colors.textMut} style={s.input} />
        <Row>
          <Button title="Save" onPress={save} style={{ flex: 1 }} />
          <Button title={testing ? 'Testing…' : 'Test'} variant="ghost" loading={testing} onPress={test} style={{ flex: 1 }} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={sync.online ? 'online' : 'offline'} tone={sync.online ? 'success' : 'neutral'} />
          <Button title={sync.syncing ? 'Syncing…' : `Sync (${sync.unsynced})`} variant="ghost"
            loading={sync.syncing} disabled={sync.unsynced === 0} onPress={sync.syncNow} />
        </Row>
      </Card>

      <SectionTitle>Recognition threshold</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Button title="–" variant="ghost" onPress={() => adjust(-0.05)} style={{ width: 60 }} />
          <Text style={s.threshold}>{threshold.toFixed(2)}</Text>
          <Button title="+" variant="ghost" onPress={() => adjust(0.05)} style={{ width: 60 }} />
        </Row>
        <Text style={s.hint}>
          Higher = stricter (fewer false accepts). LFW balanced-optimal ≈ 0.41; default 0.45. Tap Save above to apply.
        </Text>
      </Card>

      <SectionTitle>Model</SectionTitle>
      <Card>
        <Info k="Architecture" v="MobileFaceNet (ArcFace)" />
        <Info k="Input" v={`${MODEL_INPUT}×${MODEL_INPUT}×3`} />
        <Info k="Embedding" v={`${EMBED_DIM}-d`} />
        <Info k="Size" v={`${MODEL_SIZE_MB} MB`} />
        <Info k="Runtime" v="TFLite · on-device · offline" />
        <Info k="Device ID" v={deviceId} />
      </Card>

      <SectionTitle>Danger zone</SectionTitle>
      <Button title="Clear all local data" variant="danger" onPress={clearData} />
    </Screen>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={s.hint}>{k}</Text>
      <Text style={s.value}>{v}</Text>
    </Row>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  label: { color: colors.textMut, fontSize: 12, marginBottom: 4, marginTop: 4 },
  input: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15,
  },
  hint: { color: colors.textMut, fontSize: 12 },
  value: { color: colors.text, fontSize: 13, fontWeight: '600' },
  threshold: { color: colors.primary, fontSize: 28, fontWeight: '800' },
});
