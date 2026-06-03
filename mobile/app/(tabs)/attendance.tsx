import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Animated, Easing } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen, Field, Display, Heading, Body, Mono, Label, Tag, Corners, Meter, GradientButton, GhostButton,
} from '../../src/theme/ui';
import { colors, gradients } from '../../src/theme/colors';
import { font } from '../../src/theme/type';
import { useFacePipeline } from '../../src/camera/useFacePipeline';
import { l2normalize, identify, Identification } from '../../src/ml/match';
import { getGallery, countUsers } from '../../src/db/users';
import { markAttendance } from '../../src/db/attendance';
import { getSettings } from '../../src/config';
import { LivenessFSM, pickChallenge, PROMPTS, HINTS, Challenge, FaceSignals } from '../../src/liveness/challenge';

type Phase = 'idle' | 'liveness' | 'recognize' | 'result' | 'failed';
const LIVENESS_TIMEOUT = 12000;
const RET_W = 262, RET_H = 324;

export default function Scan() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [challenge, setChallenge] = useState<Challenge>('blink');
  const [face, setFace] = useState<FaceSignals>({ hasFace: false, eyeOpen: 1, smile: 0, yaw: 0 });
  const [result, setResult] = useState<{ id: Identification; latency: number } | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const fsmRef = useRef<LivenessFSM | null>(null);
  const t0Ref = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scan = useRef(new Animated.Value(0)).current;
  const setPhaseSafe = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // scanning line animation while active
  useEffect(() => {
    if (phase === 'liveness' || phase === 'recognize') {
      const loop = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 1700, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }));
      loop.start();
      return () => { loop.stop(); scan.setValue(0); };
    }
  }, [phase, scan]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  useFocusEffect(useCallback(() => {
    setActive(true);
    return () => { setActive(false); setPhaseSafe('idle'); if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []));

  const onFace = useCallback((sig: FaceSignals) => {
    setFace(sig);
    if (phaseRef.current === 'liveness' && fsmRef.current?.update(sig)) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      user_id: id.accepted ? id.id : null, name: id.accepted ? id.name : null,
      liveness_passed: true, challenge: fsmRef.current?.challenge ?? challenge, score: id.score, device_id: deviceId,
    });
    Haptics.notificationAsync(id.accepted ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    setResult({ id, latency });
    setPhaseSafe('result');
  }, [challenge]);

  const { frameProcessor, modelReady, requestEmbedding } = useFacePipeline(onFace, onEmbedding);
  const requestEmbeddingRef = useRef<() => void>();
  useEffect(() => { requestEmbeddingRef.current = requestEmbedding; }, [requestEmbedding]);

  const start = () => {
    if (countUsers() === 0) return Alert.alert('No one enrolled', 'Enrol a face first (Enrol tab).');
    if (!modelReady) return Alert.alert('Loading', 'Model still loading — try again.');
    const c = pickChallenge();
    setChallenge(c); fsmRef.current = new LivenessFSM(c); setResult(null); setPhaseSafe('liveness');
    timeoutRef.current = setTimeout(() => { if (phaseRef.current === 'liveness') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); setPhaseSafe('failed'); } }, LIVENESS_TIMEOUT);
  };

  if (!hasPermission) return <Permission onGrant={requestPermission} />;
  if (!device) return <Screen><Field><Mono>NO FRONT CAMERA AVAILABLE</Mono></Field></Screen>;

  const retColor = phase === 'result' ? (result?.id.accepted ? colors.green : colors.red) : phase === 'failed' ? colors.red : face.hasFace ? colors.amber : colors.textFaint;
  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [6, RET_H - 6] });

  return (
    <View style={st.root}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={active} frameProcessor={frameProcessor} />
      <LinearGradient colors={['rgba(16,15,12,0.85)', 'rgba(16,15,12,0)']} style={st.veilTop} pointerEvents="none" />
      <LinearGradient colors={gradients.veil} style={st.veilBottom} pointerEvents="none" />

      {/* top status strip */}
      <View style={st.top}>
        <View style={st.modePill}><Mono size={11} color={colors.amber}>● SCAN MODE</Mono></View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Tag text={face.hasFace ? 'FACE' : 'NO FACE'} tone={face.hasFace ? 'live' : 'neutral'} />
          <Tag text="OFFLINE" tone="amber" />
        </View>
      </View>

      {/* reticle */}
      <View style={st.center} pointerEvents="none">
        {phase === 'liveness' && (
          <View style={st.promptWrap}>
            <Display size={30} style={{ textAlign: 'center' }}>{PROMPTS[challenge]}</Display>
            <Mono size={12} color={colors.amberBright} style={{ textAlign: 'center', marginTop: 6 }}>{HINTS[challenge].toUpperCase()}</Mono>
          </View>
        )}
        <View style={[st.reticle, { borderColor: 'transparent' }]}>
          <Corners color={retColor} len={30} thick={3} inset={-2} />
          {(phase === 'liveness' || phase === 'recognize') && (
            <Animated.View style={[st.scanLine, { transform: [{ translateY }] }]}>
              <LinearGradient colors={['rgba(255,177,0,0)', colors.amber, 'rgba(255,177,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </Animated.View>
          )}
        </View>
        {phase === 'recognize' && <Mono size={12} color={colors.amber} style={{ marginTop: 18 }}>MATCHING…</Mono>}
      </View>

      {/* bottom control / result panel */}
      <View style={st.bottom}>
        {phase === 'idle' && (
          <Field accent={colors.amber}>
            <Label color={colors.amber}>Secure attendance</Label>
            <Body dim>Pass a random liveness check, then you’re recognised on-device in milliseconds — fully offline.</Body>
            <GradientButton title="START VERIFICATION" onPress={start} disabled={!modelReady} icon={<Ionicons name="scan" size={18} color={colors.black} />} />
          </Field>
        )}
        {phase === 'liveness' && (
          <View style={st.antispoof}><Ionicons name="shield-checkmark" size={15} color={colors.amber} /><Mono size={11.5} color={colors.amberBright}>ANTI-SPOOFING ACTIVE — A PHOTO CAN’T DO THIS</Mono></View>
        )}
        {phase === 'result' && result && (
          <Field accent={result.id.accepted ? colors.green : colors.red}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Tag text="LIVE ✓" tone="live" />
              <Mono size={12} color={colors.textDim}>{result.latency}ms · {result.id.score.toFixed(3)}</Mono>
            </View>
            {result.id.accepted ? (
              <>
                <Display size={28}>{result.id.name}</Display>
                <Label color={colors.green}>Attendance marked</Label>
              </>
            ) : (
              <>
                <Display size={26} style={{ color: colors.red }}>UNKNOWN FACE</Display>
                <Label color={colors.red}>Not recognised</Label>
              </>
            )}
            <Meter value={result.id.score} color={result.id.accepted ? colors.green : colors.red} />
            <GradientButton title="VERIFY AGAIN" onPress={start} />
          </Field>
        )}
        {phase === 'failed' && (
          <Field accent={colors.red}>
            <Tag text="LIVENESS FAILED" tone="spoof" />
            <Body dim>No live face detected in time. A static photo or screen cannot pass the challenge.</Body>
            <GradientButton title="TRY AGAIN" onPress={start} />
          </Field>
        )}
      </View>
    </View>
  );
}

function Permission({ onGrant }: { onGrant: () => void }) {
  return (
    <Screen>
      <Field accent={colors.amber} style={{ marginTop: 60 }}>
        <Ionicons name="camera-outline" size={28} color={colors.amber} />
        <Heading>Camera access</Heading>
        <Body dim>FaceAttend needs the camera to verify liveness and recognise faces.</Body>
        <GradientButton title="GRANT CAMERA ACCESS" onPress={onGrant} />
      </Field>
    </Screen>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  veilTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  veilBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280 },
  top: { position: 'absolute', top: 54, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modePill: { backgroundColor: 'rgba(16,15,12,0.7)', borderWidth: 1, borderColor: colors.line, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 4 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  promptWrap: { position: 'absolute', top: '14%', left: 20, right: 20 },
  reticle: { width: RET_W, height: RET_H, overflow: 'hidden' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2 },
  bottom: { position: 'absolute', bottom: 30, left: 18, right: 18, gap: 10 },
  antispoof: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(16,15,12,0.7)', borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 11 },
});
