import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Camera, useCameraDevice, useCameraPermission,
} from 'react-native-vision-camera';
import { Screen, Card, Button, Badge } from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { useFacePipeline } from '../../src/camera/useFacePipeline';
import { l2normalize } from '../../src/ml/match';
import { enrollUser } from '../../src/db/users';
import type { FaceSignals } from '../../src/liveness/challenge';

export default function Enroll() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [active, setActive] = useState(false);
  const [name, setName] = useState('');
  const [face, setFace] = useState<FaceSignals>({ hasFace: false, eyeOpen: 1, smile: 0, yaw: 0 });
  const [capturing, setCapturing] = useState(false);
  const nameRef = useRef('');
  const capturingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useFocusEffect(useCallback(() => {
    setActive(true);
    return () => { setActive(false); setCapturing(false); capturingRef.current = false; };
  }, []));

  const onFace = useCallback((sig: FaceSignals) => setFace(sig), []);
  const onEmbedding = useCallback((emb: number[]) => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    setCapturing(false);
    if (timer.current) clearTimeout(timer.current);
    const user = enrollUser(nameRef.current, l2normalize(emb));
    Alert.alert('Enrolled ✓', `${user.name} added to the local gallery.`);
    setName('');
  }, []);

  const { frameProcessor, modelReady, requestEmbedding } = useFacePipeline(onFace, onEmbedding);

  const onCapture = () => {
    if (!name.trim()) return Alert.alert('Name required', 'Enter a name before enrolling.');
    if (!face.hasFace) return Alert.alert('No face', 'Center your face in the frame.');
    if (!modelReady) return Alert.alert('Loading', 'The model is still loading, try again.');
    capturingRef.current = true;
    setCapturing(true);
    requestEmbedding();
    timer.current = setTimeout(() => {
      capturingRef.current = false; setCapturing(false);
      Alert.alert('Try again', 'Could not capture a clear face. Hold still and retry.');
    }, 4000);
  };

  if (!hasPermission) {
    return (
      <Screen>
        <Card>
          <Text style={s.h}>Camera permission</Text>
          <Text style={s.muted}>FaceAttend needs the camera to enroll faces.</Text>
          <Button title="Grant permission" onPress={requestPermission} />
        </Card>
      </Screen>
    );
  }
  if (!device) {
    return <Screen><Card><Text style={s.muted}>No front camera available.</Text></Card></Screen>;
  }

  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <View style={s.wrap}>
        <View style={s.cameraBox}>
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={active}
            frameProcessor={frameProcessor}
          />
          <View style={[s.oval, { borderColor: face.hasFace ? colors.success : colors.line }]} />
          <View style={s.topBadges}>
            <Badge label={modelReady ? 'MODEL READY' : 'LOADING…'} tone={modelReady ? 'success' : 'warn'} />
            <Badge label={face.hasFace ? 'FACE DETECTED' : 'NO FACE'} tone={face.hasFace ? 'success' : 'neutral'} />
          </View>
        </View>

        <View style={s.panel}>
          <Text style={s.h}>Enroll a new face</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.textMut}
            style={s.input}
          />
          <Button
            title={capturing ? 'Hold still…' : 'Capture & Enroll'}
            onPress={onCapture}
            loading={capturing}
            disabled={!modelReady}
          />
          <Text style={s.muted}>
            Tip: good lighting and a front-facing pose give the best template.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  cameraBox: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  oval: {
    position: 'absolute', alignSelf: 'center', top: '12%',
    width: '64%', height: '70%', borderRadius: 200, borderWidth: 3,
  },
  topBadges: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  panel: { padding: 18, gap: 12, backgroundColor: colors.bg },
  h: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.textMut, fontSize: 13 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 16,
  },
});
