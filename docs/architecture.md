# Architecture

This document covers the technical design of the Offline Facial Recognition &
Liveness Detection System: the on-device pipeline, data model, liveness design,
sync protocol, and performance.

## 1. System overview

Three components, one shared model:

```
┌───────────────────────────┐         ┌──────────────────────────┐
│  mobile/  (Expo RN app)    │         │  server/ (Node + SQLite) │
│  • camera + ML on-device   │  sync   │  • idempotent upsert API │
│  • liveness + recognition  │ ──────▶ │  • live dashboard        │
│  • expo-sqlite local store │ (online)│                          │
└───────────────────────────┘         └──────────────────────────┘
            ▲  same MobileFaceNet.tflite weights
            │
┌───────────────────────────┐
│  poc/  (Python reference)  │  proves accuracy / latency / size on the same model
└───────────────────────────┘
```

The phone is the **source of truth** while offline. The server is an optional
aggregator that the phone pushes to when a network is available.

## 2. On-device recognition pipeline

Implemented as a single **VisionCamera frame processor** (a worklet that runs on
a dedicated thread for every camera frame) in `mobile/src/camera/useFacePipeline.ts`.

| Stage | Tool | Cost | Notes |
| --- | --- | --- | --- |
| Face detection | MLKit (`react-native-vision-camera-face-detector`) | every frame | returns bounds + `leftEyeOpenProbability`, `rightEyeOpenProbability`, `smilingProbability`, `yawAngle` |
| Liveness signals | — | every frame | derived from the detector's classification output |
| Crop + resize | `vision-camera-resize-plugin` | on demand | face bounds → 112×112 RGB `float32` |
| Normalize | inline worklet | on demand | `(x − 127.5) / 128` → [−1, 1] (MobileFaceNet convention) |
| Embed | MobileFaceNet (`react-native-fast-tflite`, `runSync`) | on demand | 192-d vector |
| Match | `src/ml/match.ts` | on demand | L2-normalize + cosine over the gallery |

**Why on-demand embedding?** Liveness signals are cheap and delivered every
frame so the challenge feels real-time. The heavier embedding step is triggered
**once**, only after liveness passes (`requestEmbedding()` sets a shared flag the
worklet reads). This keeps the camera loop smooth while still finishing the whole
recognition in milliseconds.

**Face alignment.** The POC uses an ArcFace 5-point similarity transform (MediaPipe
landmarks) for canonical alignment, which is what yields the 98%+ LFW accuracy.
On device, MLKit returns an upright, tightly-bounded face; we crop that region
(+12% margin) and resize. The crop margin and (optional) landmark-based alignment
are the main device-side accuracy knobs.

## 3. Data model (expo-sqlite)

```sql
users(       id TEXT PK, name TEXT, embedding TEXT/*JSON 192 floats, L2-normalized*/,
             created_at INT, synced INT )
attendance(  id TEXT PK, user_id TEXT, name TEXT, timestamp INT,
             liveness_passed INT, challenge TEXT, score REAL, device_id TEXT, synced INT )
settings(    key TEXT PK, value TEXT )
```

The gallery is small for an attendance use-case (tens–hundreds), so a brute-force
cosine scan is sub-millisecond and needs no vector index. Embeddings are stored
already L2-normalized, so matching is a dot product.

## 4. Liveness / anti-spoofing

`mobile/src/liveness/challenge.ts` is a small state machine fed one frame of
signals at a time.

| Challenge | Signal | Pass condition |
| --- | --- | --- |
| `blink` | avg eye-open probability | open → **closed** (<0.35) → **open** (>0.7) transition |
| `smile` | smiling probability | > 0.6 |
| `turn_head` | head yaw angle | \|yaw\| > 20° |

**Why it works.** The challenge is chosen **randomly** per attempt and recognition
runs **only after** it passes. A printed photo or a phone screen is static — it
can't blink, smile on cue, or turn — so it never reaches recognition. A
pre-recorded video can't satisfy a *randomly chosen* live prompt. This is
*active* liveness; it can be combined with a *passive* texture-based anti-spoof
TFLite model (e.g. MiniFASNet) as a second, challenge-free layer.

The Python POC mirrors this with the same signals derived geometrically
(eye-aspect-ratio, mouth-aspect-ratio, solvePnP head pose) plus MediaPipe
blendshapes (`eyeBlink`, `jawOpen`, `mouthSmile`).

## 5. Offline → cloud sync

`mobile/src/sync` + `server/`.

1. Every user/attendance row is created locally with a **client-generated UUID**
   and `synced = 0`.
2. `@react-native-community/netinfo` watches connectivity. On reconnect (or manual
   "Sync now"), the app POSTs all `synced = 0` rows to `/sync/users` and
   `/sync/attendance` with an `x-api-key`.
3. The server **upserts by UUID** (`INSERT … ON CONFLICT DO …`), so re-sending a
   row after a dropped connection is a no-op — sync is **idempotent**.
4. The server returns the accepted IDs; the app marks those rows `synced = 1`.

This survives flaky links and duplicate sends without ever creating duplicate
attendance records.

## 6. Performance (< 1 second)

Measured per-stage on a laptop CPU (`poc/benchmark.py`, LFW):

```
detect  ~8.0 ms   │ MLKit / MediaPipe face detection
align   ~0.3 ms   │ 5-point similarity transform
embed   ~4.7 ms   │ MobileFaceNet TFLite inference
match   ~0.2 ms   │ cosine over the gallery
────────────────
total   ~13 ms     →  ~76× under the 1-second budget
```

On a mid-range phone the same TFLite model runs through the NNAPI/GPU delegate;
expect tens of milliseconds — still far under 1 s. Liveness adds a couple of
seconds of *user interaction*, but the *recognition + verification compute* is
what the requirement targets, and that is milliseconds.

## 7. Model

- **MobileFaceNet** trained with ArcFace/InsightFace loss.
- Input `112×112×3` `float32`, normalized to [−1, 1]; output **192-d** embedding.
- **4.99 MB** TFLite. The identical file ships in `mobile/assets/models/` and is
  used by `poc/` — so POC numbers are representative of the device.
- Operating cosine threshold **0.45** (LFW balanced-optimal ≈ 0.41; biased
  slightly stricter for security; tunable in Settings).

## 8. Security considerations

- Face templates never leave the device unless the operator enables sync; even
  then only the embedding (not imagery) is transmitted, over an API-key-guarded
  endpoint.
- Liveness gates recognition, mitigating photo/replay attacks.
- `device_id` and `liveness_passed` are recorded per attendance event for audit.
- For production: add TLS + rotating tokens to the server, on-device encryption
  of the SQLite store, and the passive anti-spoof model.

## 9. Extensibility

- **Passive anti-spoof:** drop in a MiniFASNet TFLite as a parallel frame-processor
  check; combine with the active challenge.
- **Larger galleries:** swap the brute-force scan for an on-device ANN index.
- **iOS:** the same stack builds for iOS (CoreML delegate available via the
  fast-tflite plugin).
