import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen, Field, Display, Mono, Label, Body, Tag, GradientButton, GhostButton, Divider,
} from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { font } from '../../src/theme/type';
import { getSettings, updateSettings } from '../../src/config';
import { checkHealth } from '../../src/sync/client';
import { getDb } from '../../src/db/database';
import { MODEL_INPUT, EMBED_DIM, MODEL_SIZE_MB } from '../../src/ml/constants';
import { useSync } from '../../src/sync/useSync';

export default function Config() {
  const sync = useSync();
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [threshold, setThreshold] = useState(0.45);
  const [deviceId, setDeviceId] = useState('');
  const [testing, setTesting] = useState(false);

  useFocusEffect(useCallback(() => {
    const s = getSettings();
    setServerUrl(s.serverUrl); setApiKey(s.apiKey); setThreshold(s.threshold); setDeviceId(s.deviceId);
  }, []));

  const save = () => { updateSettings({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim(), threshold }); Alert.alert('Saved', 'Configuration updated.'); };
  const test = async () => { setTesting(true); const ok = await checkHealth(serverUrl.trim()); setTesting(false); Alert.alert(ok ? 'Connected ✓' : 'No connection', ok ? `${serverUrl} is reachable.` : `Could not reach ${serverUrl}.`); };
  const adjust = (d: number) => setThreshold((t) => Math.min(0.7, Math.max(0.3, +(t + d).toFixed(2))));
  const clearData = () => Alert.alert('Clear all data', 'Delete all enrolled faces and attendance on this device?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { getDb().execSync('DELETE FROM users; DELETE FROM attendance;'); Alert.alert('Cleared', 'Local data removed.'); sync.refreshCount(); } },
  ]);

  return (
    <Screen>
      <Display size={26}>CONFIG</Display>

      <Divider label="Cloud sync server" />
      <Field>
        <Label>Server URL</Label>
        <TextInput value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" placeholder="http://192.168.x.x:4000" placeholderTextColor={colors.textFaint} style={st.input} />
        <Mono size={10.5} color={colors.textFaint}>// device: your PC's LAN IP · emulator: 10.0.2.2:4000</Mono>
        <Label>API key</Label>
        <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" placeholderTextColor={colors.textFaint} style={st.input} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GradientButton title="SAVE" onPress={save} style={{ flex: 1 }} />
          <GhostButton title={testing ? 'TESTING…' : 'TEST'} loading={testing} onPress={test} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Tag text={sync.online ? 'ONLINE' : 'OFFLINE'} tone={sync.online ? 'live' : 'neutral'} />
          <GhostButton title={sync.syncing ? 'SYNCING…' : `SYNC (${sync.unsynced})`} loading={sync.syncing} disabled={sync.unsynced === 0} onPress={sync.syncNow} style={{ paddingHorizontal: 18 }} />
        </View>
      </Field>

      <Divider label="Recognition threshold" />
      <Field>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stepper label="−" onPress={() => adjust(-0.05)} />
          <Mono size={32} color={colors.amber}>{threshold.toFixed(2)}</Mono>
          <Stepper label="+" onPress={() => adjust(0.05)} />
        </View>
        <Mono size={10.5} color={colors.textFaint}>// higher = stricter · LFW optimal ≈ 0.41 · save to apply</Mono>
      </Field>

      <Divider label="People" />
      <Pressable onPress={() => router.push('/people')} style={st.link}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="people-outline" size={18} color={colors.amber} /><Mono color={colors.text}>MANAGE ENROLLED</Mono></View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </Pressable>

      <Divider label="Model" />
      <Field>
        <Info k="ARCHITECTURE" v="MobileFaceNet · ArcFace" />
        <Info k="INPUT" v={`${MODEL_INPUT}×${MODEL_INPUT}×3`} />
        <Info k="EMBEDDING" v={`${EMBED_DIM}-D`} />
        <Info k="SIZE" v={`${MODEL_SIZE_MB} MB`} />
        <Info k="RUNTIME" v="TFLite · ON-DEVICE" />
        <Info k="DEVICE ID" v={deviceId} />
      </Field>

      <Divider label="Danger zone" />
      <GhostButton title="CLEAR ALL LOCAL DATA" tone="danger" onPress={clearData} />
    </Screen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={st.stepper}><Text style={{ fontFamily: font.bold, fontSize: 22, color: colors.amber }}>{label}</Text></Pressable>;
}
function Info({ k, v }: { k: string; v: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Label>{k}</Label><Mono size={12} color={colors.text}>{v}</Mono></View>;
}

const st = StyleSheet.create({
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 14, fontFamily: font.mono },
  stepper: { width: 58, height: 48, borderRadius: 6, borderWidth: 1, borderColor: colors.lineBright, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 15 },
});
