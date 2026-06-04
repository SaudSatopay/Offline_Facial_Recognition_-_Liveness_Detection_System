# Integration Guide — dropping this into an existing React Native app

This system is built so the recognition + liveness pipeline can be lifted into an
existing React Native codebase (e.g. **Datalake 3.0**) with minimal surface area.
The logic lives in framework-agnostic modules under `mobile/src/`; the screens in
`mobile/app/` are just one way to drive them.

## 1. What you copy

```
src/camera/useFacePipeline.ts   the on-device pipeline (detect → liveness signals → embed)
src/liveness/challenge.ts       blink / smile / head-turn state machine (pure logic)
src/ml/match.ts, constants.ts   L2-normalize, cosine identify, threshold
src/db/*                         expo-sqlite schema + DAOs (users, attendance, settings)
src/sync/*                       REST client + NetInfo-driven flush/purge
assets/models/mobilefacenet.tflite
```

No UI/theme code is required — bring your own components.

## 2. Native dependencies

```bash
npx expo install react-native-vision-camera react-native-worklets-core \
  react-native-fast-tflite vision-camera-resize-plugin \
  react-native-vision-camera-face-detector expo-sqlite @react-native-community/netinfo
```
- Add the VisionCamera + fast-tflite **config plugins** to `app.json` (see ours).
- `babel.config.js`: add `'react-native-worklets-core/plugin'`.
- `metro.config.js`: `config.resolver.assetExts.push('tflite')`.
- Pinned, mutually-compatible versions are in `mobile/package.json`.

## 3. Minimal usage

```tsx
import { useCallback, useRef } from 'react';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useFacePipeline } from './src/camera/useFacePipeline';
import { LivenessFSM, pickChallenge, FaceSignals } from './src/liveness/challenge';
import { identify, l2normalize } from './src/ml/match';
import { getGallery } from './src/db/users';
import { markAttendance } from './src/db/attendance';

function Scanner() {
  const device = useCameraDevice('front');
  const fsm = useRef(new LivenessFSM(pickChallenge()));

  const onFace = useCallback((sig: FaceSignals) => {
    if (fsm.current.update(sig)) requestEmbeddingRef.current?.(); // liveness passed
  }, []);

  const onEmbedding = useCallback((emb: number[]) => {
    const match = identify(l2normalize(emb), getGallery()); // 1:N cosine match
    if (match.accepted) markAttendance({ user_id: match.id, name: match.name, /* … */ });
  }, []);

  const { frameProcessor, modelReady, requestEmbedding } = useFacePipeline(onFace, onEmbedding);
  const requestEmbeddingRef = useRef(requestEmbedding);
  // render <Camera device={device} frameProcessor={frameProcessor} isActive .../>
}
```

The pipeline delivers **liveness signals every frame** and computes a **192-d
embedding on demand** (one-shot) when you call `requestEmbedding()` — so the
camera loop stays real-time.

## 4. Enrollment & data

```ts
import { enrollUser, getGallery, listUsers, deleteUser } from './src/db/users';
enrollUser('Asha Rao', l2normalize(embedding));   // store a face template (192 floats)
```
Embeddings are stored in `expo-sqlite` as JSON; templates never leave the device
unless sync is enabled (and even then only the embedding, not imagery).

## 5. Sync + purge (offline-first)

```ts
import { useSync } from './src/sync/useSync';
const sync = useSync();             // auto-flushes when NetInfo reports connectivity
sync.syncNow();                     // manual flush of unsynced rows (idempotent)
sync.purgeNow();                    // free storage: drop cloud-confirmed records
```
Point it at your backend by setting `serverUrl` / `apiKey` (`src/config.ts`), or
swap `src/sync/client.ts` for your Datalake 3.0 ingestion endpoint — the contract
is a simple `POST { records: [...] }` returning the accepted UUIDs.

## 6. Tuning knobs

| Where | What |
| --- | --- |
| `src/ml/constants.ts` | recognition cosine threshold (FAR/FRR per site) |
| `src/liveness/challenge.ts` | blink/smile/yaw thresholds + which challenges to use |
| `src/camera/useFacePipeline.ts` | face-crop margin, model input normalization |
| `src/sync/useSync.ts` | retention window for the purge mechanism |

Everything is plain TypeScript — no native code changes required to integrate.
