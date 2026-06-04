import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Glyph as Ionicons } from '../../src/theme/Glyph';
import { Screen, Field, Heading, Body, Mono, Label, Tag, Corners, GradientButton } from '../../src/theme/ui';
import { colors, gradients } from '../../src/theme/colors';
import { font } from '../../src/theme/type';
import { useFacePipeline } from '../../src/camera/useFacePipeline';
import { l2normalize, identify, averageEmbedding } from '../../src/ml/match';
import { enrollUser, getUserByName, getGallery } from '../../src/db/users';
import { DUP_THRESHOLD, ENROLL_FRAMES } from '../../src/ml/constants';
import type { FaceSignals } from '../../src/liveness/challenge';

const RET = 250;

export default function Enrol() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [name, setName] = useState('');
  const [face, setFace] = useState<FaceSignals>({ hasFace: false, eyeOpen: 1, smile: 0, yaw: 0 });
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const nameRef = useRef('');
  const capturingRef = useRef(false);
  const framesRef = useRef<number[][]>([]);
  const requestEmbeddingRef = useRef<() => void>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useFocusEffect(useCallback(() => {
    setActive(true);
    return () => { setActive(false); setCapturing(false); capturingRef.current = false; };
  }, []));

  const onFace = useCallback((sig: FaceSignals) => setFace(sig), []);
  const finalizeEnroll = useCallback((name: string, template: number[]) => {
    const user = enrollUser(name, template);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Enrolled ✓', `${user.name} added to the on-device gallery.`, [
      { text: 'Done' }, { text: 'View people', onPress: () => router.push('/people') },
    ]);
    setName('');
  }, [router]);
  const onEmbedding = useCallback((emb: number[]) => {
    if (!capturingRef.current) return;
    framesRef.current.push(l2normalize(emb));
    setProgress(framesRef.current.length);
    if (framesRef.current.length < ENROLL_FRAMES) {
      requestEmbeddingRef.current?.(); // collect the next frame
      return;
    }
    // collected enough frames — average them into one sturdy template
    capturingRef.current = false; setCapturing(false); setProgress(0);
    if (timer.current) clearTimeout(timer.current);
    const name = nameRef.current.trim();
    const template = averageEmbedding(framesRef.current);
    framesRef.current = [];

    // Duplicate-registration guard — an already-enrolled person must not be able
    // to register again, by name OR by face.
    const byName = getUserByName(name);
    if (byName) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Already registered', `The name "${byName.name}" is already in the on-device gallery. Use a different name, or remove the existing entry first.`);
      return;
    }
    const dup = identify(template, getGallery(), DUP_THRESHOLD);
    if (dup.accepted && dup.name) {
      // Soft guard: a similar-looking face may still be a different person (e.g. a
      // relative), so warn and let the operator confirm instead of hard-blocking.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Possible duplicate',
        `This face looks similar to "${dup.name}" (${Math.round(dup.score * 100)}% match). If it's the same person, cancel. If it's a different person (e.g. a relative), enrol them anyway.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enrol anyway', onPress: () => finalizeEnroll(name, template) },
        ],
      );
      return;
    }
    finalizeEnroll(name, template);
  }, [finalizeEnroll]);

  const { frameProcessor, modelReady, requestEmbedding } = useFacePipeline(onFace, onEmbedding);
  useEffect(() => { requestEmbeddingRef.current = requestEmbedding; }, [requestEmbedding]);

  const capture = () => {
    if (!name.trim()) return Alert.alert('Name required', 'Enter a name before enrolling.');
    if (!face.hasFace) return Alert.alert('No face', 'Center the face inside the brackets.');
    if (Math.abs(face.yaw) > 18) return Alert.alert('Look straight ahead', 'Face the camera directly while enrolling.');
    if (face.eyeOpen < 0.4) return Alert.alert('Open your eyes', 'Keep your eyes open while enrolling.');
    if (!modelReady) return Alert.alert('Loading', 'Model still loading — try again.');
    framesRef.current = []; setProgress(0);
    capturingRef.current = true; setCapturing(true);
    requestEmbedding();
    timer.current = setTimeout(() => {
      capturingRef.current = false; setCapturing(false); setProgress(0); framesRef.current = [];
      Alert.alert('Try again', 'Could not capture clear frames — hold still, face the camera, and retry.');
    }, 6000);
  };

  if (!hasPermission) return (
    <Screen><Field accent={colors.amber} style={{ marginTop: 60 }}>
      <Ionicons name="camera-outline" size={28} color={colors.amber} />
      <Heading>Camera access</Heading><Body dim>Needed to capture a face template.</Body>
      <GradientButton title="GRANT CAMERA ACCESS" onPress={requestPermission} />
    </Field></Screen>
  );
  if (!device) return <Screen><Field><Mono>NO FRONT CAMERA</Mono></Field></Screen>;

  return (
    <View style={st.root}>
      {active && <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} frameProcessor={frameProcessor} />}
      <LinearGradient colors={['rgba(16,15,12,0.85)', 'rgba(16,15,12,0)']} style={st.veilTop} pointerEvents="none" />
      <LinearGradient colors={gradients.veil} style={st.veilBottom} pointerEvents="none" />

      <View style={st.top}>
        <View style={st.modePill}><Mono size={11} color={colors.amber}>● ENROL MODE</Mono></View>
        <Tag text={modelReady ? 'MODEL READY' : 'LOADING'} tone={modelReady ? 'live' : 'warn'} />
      </View>

      <View style={st.center} pointerEvents="none">
        <View style={st.reticle}><Corners color={face.hasFace ? colors.green : colors.textFaint} len={28} thick={3} inset={-2} /></View>
        <Mono size={11} color={colors.textDim} style={{ marginTop: 16 }}>{face.hasFace ? 'FACE LOCKED' : 'ALIGN FACE IN FRAME'}</Mono>
      </View>

      <View style={st.bottom}>
        <Field accent={colors.amber}>
          <Label color={colors.amber}>Register a new face</Label>
          <TextInput
            value={name} onChangeText={setName} placeholder="Full name"
            placeholderTextColor={colors.textFaint} style={st.input}
          />
          <GradientButton title={capturing ? `HOLD STILL… ${progress}/${ENROLL_FRAMES}` : 'CAPTURE & ENROL'} loading={capturing} disabled={!modelReady} onPress={capture} icon={!capturing ? <Ionicons name="camera" size={18} color={colors.black} /> : undefined} />
          <Mono size={11} color={colors.textFaint}>// good light + a frontal pose = best template</Mono>
        </Field>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  veilTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  veilBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300 },
  top: { position: 'absolute', top: 54, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modePill: { backgroundColor: 'rgba(16,15,12,0.7)', borderWidth: 1, borderColor: colors.line, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 4 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', marginTop: -40 },
  reticle: { width: RET, height: RET * 1.25 },
  bottom: { position: 'absolute', bottom: 28, left: 18, right: 18 },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingHorizontal: 13, paddingVertical: 12, color: colors.text, fontSize: 16, fontFamily: font.medium },
});
