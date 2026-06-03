// The on-device pipeline, all inside a VisionCamera frame processor (worklet):
//
//   frame ─▶ MLKit face detector ─▶ liveness signals (eye/smile/yaw) ──▶ JS
//                    │
//                    └─(when requested)─▶ crop+resize to 112x112 ─▶ MobileFaceNet
//                                              (vision-camera-resize-plugin)   │
//                                                                       192-d embedding ─▶ JS
//
// Liveness signals are delivered every frame (cheap). The heavy embedding is
// computed only when JS calls requestEmbedding() (one-shot), keeping the loop
// real-time. Everything runs offline on the device — no network involved.
import { useCallback, useMemo } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Worklets, useSharedValue } from 'react-native-worklets-core';
import { MODEL_INPUT } from '../ml/constants';
import type { FaceSignals } from '../liveness/challenge';

export function useFacePipeline(
  onFace: (sig: FaceSignals) => void,
  onEmbedding: (embedding: number[]) => void,
) {
  const tf = useTensorflowModel(require('../../assets/models/mobilefacenet.tflite'));
  const model = tf.state === 'loaded' ? tf.model : undefined;
  const { resize } = useResizePlugin();
  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    classificationMode: 'all', // -> eye-open + smiling probabilities
    landmarkMode: 'none',
    contourMode: 'none',
    minFaceSize: 0.15,
  });

  const wantEmbedding = useSharedValue(false);
  const onFaceJS = useMemo(() => Worklets.createRunOnJS(onFace), [onFace]);
  const onEmbeddingJS = useMemo(() => Worklets.createRunOnJS(onEmbedding), [onEmbedding]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const faces = detectFaces(frame);
      if (!faces || faces.length === 0) {
        onFaceJS({ hasFace: false, eyeOpen: 1, smile: 0, yaw: 0 });
        return;
      }
      const f = faces[0];
      const eyeOpen = (f.leftEyeOpenProbability + f.rightEyeOpenProbability) / 2;
      onFaceJS({ hasFace: true, eyeOpen, smile: f.smilingProbability, yaw: f.yawAngle });

      if (!wantEmbedding.value || model == null) return;

      // crop to the face (with a small margin), clamped to the frame
      const fw = frame.width;
      const fh = frame.height;
      const mx = f.bounds.width * 0.12;
      const my = f.bounds.height * 0.12;
      let x = f.bounds.x - mx;
      let y = f.bounds.y - my;
      let w = f.bounds.width + mx * 2;
      let h = f.bounds.height + my * 2;
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + w > fw) w = fw - x;
      if (y + h > fh) h = fh - y;
      if (w < 10 || h < 10) return;

      const resized = resize(frame, {
        crop: { x, y, width: w, height: h },
        scale: { width: MODEL_INPUT, height: MODEL_INPUT },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });
      // MobileFaceNet expects normalized input in [-1, 1]
      for (let i = 0; i < resized.length; i++) resized[i] = (resized[i] - 127.5) / 128;

      const outputs = model.runSync([resized]);
      const out = outputs[0];
      const embedding: number[] = [];
      for (let i = 0; i < out.length; i++) embedding.push(out[i] as number);

      wantEmbedding.value = false; // one-shot
      onEmbeddingJS(embedding);
    },
    [model, detectFaces, resize, onFaceJS, onEmbeddingJS],
  );

  const requestEmbedding = useCallback(() => {
    wantEmbedding.value = true;
  }, [wantEmbedding]);

  return {
    frameProcessor,
    modelReady: tf.state === 'loaded',
    modelError: tf.state === 'error',
    requestEmbedding,
  };
}
