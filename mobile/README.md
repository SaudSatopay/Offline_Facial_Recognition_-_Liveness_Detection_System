# FaceAttend — Mobile App (Expo / React Native)

The on-device product: **offline** facial recognition + **liveness** anti-spoofing
for attendance, running on Android & iOS. All inference happens on the phone —
no network required — and results sync to the cloud when connectivity returns.

## On-device pipeline

```
VisionCamera frame ─▶ MLKit face detector ─▶ liveness signals (eye / smile / yaw)
   (frame processor)         │                         │
                             │                  LivenessFSM (blink / smile / turn)
                             │                         │  pass = real human
                             ▼ (on pass)               ▼
            vision-camera-resize-plugin ─▶ 112×112 RGB crop
                             │
                             ▼
            MobileFaceNet.tflite (react-native-fast-tflite)
                  192-d embedding ─▶ cosine match vs expo-sqlite gallery
                             │
                             ▼
                  attendance saved locally ─▶ sync queue ─▶ Node server
```

| Concern | Implementation |
| --- | --- |
| Offline recognition | MobileFaceNet TFLite (`assets/models/`, ~5 MB) runs on-device |
| Liveness / anti-spoof | random blink / smile / head-turn challenge from MLKit signals (`src/liveness`) |
| < 1 second | detect + crop + embed + match — milliseconds (see `/poc` benchmark) |
| Offline-first storage | `expo-sqlite` (`src/db`) — users, attendance, settings |
| Cloud sync | `@react-native-community/netinfo` + REST to `../server` (`src/sync`) |

## Tech stack (pinned, mutually-compatible)

Expo **SDK 52** (RN 0.76, **old architecture** for VisionCamera-v4 stability) ·
`react-native-vision-camera@4.7.3` · `react-native-worklets-core@1.6.3` ·
`react-native-fast-tflite@1.6.1` · `vision-camera-resize-plugin@3.2.0` ·
`react-native-vision-camera-face-detector@1.10.1` · `expo-router@4`.

## Run on a physical Android device (recommended for the demo)

> A custom dev build is required (native camera + TFLite modules — Expo Go won't work).

```bash
# 0. one-time: enable USB debugging on the phone, connect via USB, `adb devices` shows it
cd mobile
npm install

# 1. build + install the dev app on the connected device (first build ~5–10 min)
npx expo run:android --device

# 2. (separate terminal) start the sync server on your computer
cd ../server && npm install && npm start
```

Then in the app: **Settings → Server URL =** `http://<your-computer-LAN-IP>:4000`
(find it with `ipconfig` / `ifconfig`), tap **Test**, then **Save**.

### No Android toolchain? Build an APK in the cloud (EAS)

```bash
npm i -g eas-cli && eas login
eas build -p android --profile preview      # returns a downloadable APK to sideload
```

## Using the app (5 tabs)

1. **Enrol** — type a name, align your face in the brackets, *Capture & Enrol* (stored locally).
2. **Scan** — *Start verification* → complete the random liveness challenge →
   you're recognized on-device and attendance is marked, with the latency shown.
   Try holding up a printed photo: it can't blink/smile/turn, so it's rejected.
3. **Log** — the local attendance log (with per-row sync status).
4. **Status** — dashboard: stats, recent activity, sync, and **Manage enrolled** (delete people).
5. **Config** — server URL/key, recognition threshold, connection test, sync, model info.

The UI is a deliberate **"field terminal"** design — warm charcoal, hi-vis amber
signal accent, Archivo + Space Mono type, targeting-reticle viewfinders, and a
scanning-line animation — themed for highway field-security use.

### Prove it's truly offline
Enable airplane mode, mark attendance (still works), then re-enable the network —
the queued records auto-sync and appear on the server dashboard at `http://localhost:4000`.

## Project layout

```
app/                      expo-router screens
  (tabs)/ index(Status) | attendance(Scan) | enroll(Enrol) | records(Log) | settings(Config)
  people.tsx              enrolled-people management (delete)
src/
  camera/useFacePipeline  VisionCamera frame processor (detect → resize → embed)
  liveness/challenge      blink/smile/turn state machine
  ml/ match | constants   L2-normalize, cosine identify, threshold
  theme/ colors|type|ui   "field terminal" design system + components
  db/ database|users|attendance   expo-sqlite schema + DAOs
  sync/ client | useSync  REST client + NetInfo-driven flushing
  theme/ colors | ui      dark UI kit (matches the server dashboard)
  config.ts               persisted settings
assets/models/mobilefacenet.tflite
```

## Tuning knobs (if you iterate on a device)

- **Liveness sensitivity** — thresholds in `src/liveness/challenge.ts` (`EYE_*`, `SMILE_ON`, `YAW_TURN`).
- **Recognition strictness** — `DEFAULT_THRESHOLD` in `src/ml/constants.ts` or live in Settings.
- **Face crop margin** — the `0.12` margin in `src/camera/useFacePipeline.ts` (if crops feel tight/loose).
- **GPU delegate** — add `enableAndroidGpuLibraries: true` to the fast-tflite plugin in `app.json` and load the model with the `'android-gpu'` delegate for extra speed (CPU/NNAPI is already < 1 s).
- **New Architecture** — left **off** for v4 VisionCamera stability; flip `newArchEnabled` in `app.json` only if you upgrade the camera stack.
```
