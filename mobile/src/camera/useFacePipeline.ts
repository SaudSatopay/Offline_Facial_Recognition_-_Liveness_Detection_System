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
    landmarkMode: 'all',       // -> eye positions, for ArcFace-style alignment
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

      // Align the crop to the eyes. MobileFaceNet (ArcFace) is alignment-sensitive,
      // so a loose bounding-box crop makes the embedding encode framing more than
      // identity. We scale + center on the inter-ocular line toward the ArcFace
      // canonical layout so identity drives the embedding. (A full rotational warp
      // was tried but jittered on noisy fast-mode landmarks; this is the stable
      // version — see docs/benchmarks/ondevice-recognition.md.)
      const fw = frame.width;
      const fh = frame.height;
      const lm = f.landmarks;
      let x: number, y: number, w: number, h: number;
      if (lm != null && lm.LEFT_EYE != null && lm.RIGHT_EYE != null) {
        const ex = (lm.LEFT_EYE.x + lm.RIGHT_EYE.x) / 2;
        const ey = (lm.LEFT_EYE.y + lm.RIGHT_EYE.y) / 2;
        const iod = Math.sqrt(
          (lm.RIGHT_EYE.x - lm.LEFT_EYE.x) ** 2 + (lm.RIGHT_EYE.y - lm.LEFT_EYE.y) ** 2,
        ) || 1;
        const side = iod * 3.178;   // canonical inter-ocular distance is ~35.2px in 112
        x = ex - 0.499 * side;      // canonical eye-center sits at (0.499, 0.461) of the crop
        y = ey - 0.461 * side;
        w = side; h = side;
      } else {
        const mx = f.bounds.width * 0.12;
        const my = f.bounds.height * 0.12;
        x = f.bounds.x - mx; y = f.bounds.y - my;
        w = f.bounds.width + mx * 2; h = f.bounds.height + my * 2;
      }
      // clamp into the frame, preserving the (square) crop size where possible
      if (w > fw) w = fw;
      if (h > fh) h = fh;
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + w > fw) x = fw - w;
      if (y + h > fh) y = fh - h;
      if (w < 10 || h < 10) return;

      const resized = resize(frame, {
        crop: { x, y, width: w, height: h },
        scale: { width: MODEL_INPUT, height: MODEL_INPUT },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });
      // MobileFaceNet expects [-1, 1]. The resize plugin returns float32 in [0, 1]
      // (NOT [0, 255]), so rescale before the (x-127.5)/128 normalization — matching
      // the POC. (Without the *255 every pixel collapsed to ~-0.99, a flat image, so
      // all faces produced a near-identical embedding.)
      for (let i = 0; i < resized.length; i++) resized[i] = (resized[i] * 255 - 127.5) / 128;

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
