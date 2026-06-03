import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Camera, useCameraDevice, useCameraPermission,
} from 'react-native-vision-camera';
import { Screen, Card, Button, Badge, Row } from '../../src/theme/ui';
import { colors } from '../../src/theme/colors';
import { useFacePipeline } from '../../src/camera/useFacePipeline';
import { l2normalize, identify, Identification } from '../../src/ml/match';
import { getGallery, countUsers } from '../../src/db/users';
import { markAttendance } from '../../src/db/attendance';
import { getSettings } from '../../src/config';
import {
  LivenessFSM, pickChallenge, PROMPTS, HINTS, Challenge, FaceSignals,
} from '../../src/liveness/challenge';

type Phase = 'idle' | 'liveness' | 'recognize' | 'result' | 'failed';
const LIVENESS_TIMEOUT = 12000;

export default function Attendance() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [active, setActive] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [challenge, setChallenge] = useState<Challenge>('blink');
  const [face, setFace] = useState<FaceSignals>({ hasFace: false, eyeOpen: 1, smile: 0, yaw: 0 });
  const [result, setResult] = useState<{ id: Identification; latency: number; challenge: Challenge } | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const fsmRef = useRef<LivenessFSM | null>(null);
  const t0Ref = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPhaseSafe = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  useFocusEffect(useCallback(() => {
    setActive(true);
    return () => {
      setActive(false);
      setPhaseSafe('idle');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []));

  const onFace = useCallback((sig: FaceSignals) => {
    setFace(sig);
    if (phaseRef.current === 'liveness' && fsmRef.current?.update(sig)) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPhaseSafe('recognize');
      t0Ref.current = Date.now();
      requestEmbeddingRef.current?.();
    }
  }, []);

  const onEmbedding = useCallback((emb: number[]) => {
    if (phaseRef.current !== 'recognize') return;
    const latency = Date.now() - t0Ref.current;
    const { threshold, deviceId } = getSettings();
    const id = identify(l2normalize(emb), getGallery(), threshold);
    markAttendance({
      user_id: id.accepted ? id.id : null,
      name: id.accepted ? id.name : null,
      liveness_passed: true,
      challenge: fsmRef.current?.challenge ?? challenge,
      score: id.score,
      device_id: deviceId,
    });
    setResult({ id, latency, challenge: fsmRef.current?.challenge ?? challenge });
    setPhaseSafe('result');
  }, [challenge]);

  const { frameProcessor, modelReady, requestEmbedding } = useFacePipeline(onFace, onEmbedding);
  const requestEmbeddingRef = useRef<() => void>();
  useEffect(() => { requestEmbeddingRef.current = requestEmbedding; }, [requestEmbedding]);

  const start = () => {
    if (countUsers() === 0) return Alert.alert('No one enrolled', 'Enroll a face first.');
    if (!modelReady) return Alert.alert('Loading', 'Model still loading, try again.');
    const c = pickChallenge();
    setChallenge(c);
    fsmRef.current = new LivenessFSM(c);
    setResult(null);
    setPhaseSafe('liveness');
    timeoutRef.current = setTimeout(() => {
      if (phaseRef.current === 'liveness') setPhaseSafe('failed');
    }, LIVENESS_TIMEOUT);
  };

  if (!hasPermission) {
    return (
      <Screen>
        <Card>
          <Text style={s.h}>Camera permission</Text>
          <Text style={s.muted}>FaceAttend needs the camera to verify attendance.</Text>
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
      <View style={s.cameraBox}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={active}
          frameProcessor={frameProcessor}
        />
        <View style={[s.oval, { borderColor: ovalColor(phase, face) }]} />

        <View style={s.top}>
          <Badge label={face.hasFace ? 'FACE ✓' : 'NO FACE'} tone={face.hasFace ? 'success' : 'neutral'} />
          <Badge label={modelReady ? 'OFFLINE · ON-DEVICE' : 'LOADING…'} tone={modelReady ? 'success' : 'warn'} />
        </View>

        {/* Liveness prompt */}
        {phase === 'liveness' && (
          <View style={s.center}>
            <Text style={s.prompt}>{PROMPTS[challenge]}</Text>
            <Text style={s.hint}>{HINTS[challenge]}</Text>
            <Text style={s.anti}>🛡️ Anti-spoofing — a photo can’t do this</Text>
          </View>
        )}
        {phase === 'recognize' && (
          <View style={s.center}><Text style={s.prompt}>Recognizing…</Text></View>
        )}

        {/* Result overlay */}
        {phase === 'result' && result && (
          <View style={s.resultWrap}>
            <Card style={{ width: '100%' }}>
              <Row><Badge label="LIVE ✓" tone="success" /><Badge label={`${result.latency} ms`} tone="neutral" /></Row>
              {result.id.accepted ? (
                <>
                  <Text style={s.bigName}>{result.id.name}</Text>
                  <Text style={s.muted}>Attendance marked · score {result.id.score.toFixed(3)}</Text>
                </>
              ) : (
                <>
                  <Text style={[s.bigName, { color: colors.danger }]}>Unknown face</Text>
                  <Text style={s.muted}>Not recognized · best score {result.id.score.toFixed(3)}</Text>
                </>
              )}
              <Button title="Verify again" onPress={start} />
            </Card>
          </View>
        )}

        {phase === 'failed' && (
          <View style={s.resultWrap}>
            <Card style={{ width: '100%' }}>
              <Badge label="LIVENESS FAILED" tone="danger" />
              <Text style={s.muted}>No live face detected in time. A static photo cannot pass.</Text>
              <Button title="Try again" onPress={start} />
            </Card>
          </View>
        )}

        {phase === 'idle' && (
          <View style={s.resultWrap}>
            <Card style={{ width: '100%' }}>
              <Text style={s.h}>Secure attendance</Text>
              <Text style={s.muted}>Pass a quick liveness check, then we recognize you on-device.</Text>
              <Button title="Start verification" onPress={start} disabled={!modelReady} />
            </Card>
          </View>
        )}
      </View>
    </Screen>
  );
}

function ovalColor(phase: Phase, face: FaceSignals) {
  if (phase === 'result') return colors.success;
  if (phase === 'failed') return colors.danger;
  return face.hasFace ? colors.primary : colors.line;
}

const s = StyleSheet.create({
  cameraBox: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  oval: {
    position: 'absolute', alignSelf: 'center', top: '10%',
    width: '70%', height: '64%', borderRadius: 220, borderWidth: 3,
  },
  top: {
    position: 'absolute', top: 16, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  center: { position: 'absolute', top: '14%', left: 20, right: 20, alignItems: 'center', gap: 6 },
  prompt: {
    color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center',
    textShadowColor: '#000', textShadowRadius: 8,
  },
  hint: { color: '#dfe6f5', fontSize: 14, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 6 },
  anti: { color: colors.warn, fontSize: 13, marginTop: 8, fontWeight: '600' },
  resultWrap: { position: 'absolute', bottom: 24, left: 18, right: 18 },
  bigName: { color: colors.text, fontSize: 24, fontWeight: '800' },
  h: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.textMut, fontSize: 13 },
});
