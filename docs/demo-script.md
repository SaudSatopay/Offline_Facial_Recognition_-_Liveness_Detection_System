# Demo Script

A 3–4 minute storyboard that demonstrates **every** judged requirement. Two
tracks: the **mobile app** (primary) and a **laptop fallback** (POC + dashboard)
that works even without the device build.

---

## Before you record

1. **Server:** `cd server && npm start` → dashboard at `http://localhost:4000`
   (open it on screen). Optionally `npm run seed` for a populated look, or start empty.
2. **Phone & laptop on the same Wi-Fi.** Find your laptop's LAN IP (`ipconfig` /
   `ifconfig`), e.g. `192.168.1.20`.
3. **App:** `cd mobile && npx expo run:android --device`. In the app →
   **Settings** → Server URL `http://192.168.1.20:4000` → **Test** (expect ✓) → **Save**.
4. Have a **printed photo** (or a second phone showing a face) ready for the spoof test.

---

## Scene 1 — The problem (15s)

> "Attendance fraud and zero-network sites are the two hard problems. Our system
> recognizes faces **fully offline**, blocks **fake/photo** attendance with a
> liveness check, and runs on a normal phone in **under a second**."

Show the **Home** screen: badges *100% OFFLINE · < 1s AUTH · LIVENESS ON*, the
*Model 4.99 MB* and *Accuracy 98.3%* stat cards.

## Scene 2 — Enrollment (25s)

- Go to **Enroll**, type a name, center your face (the oval turns green: *FACE DETECTED*).
- Tap **Capture & Enroll** → "Enrolled ✓".

> "A single capture creates a 192-dimension face template, stored **locally** in
> SQLite. No cloud, no internet."

## Scene 3 — Liveness blocks a spoof (35s) ⭐

- Go to **Attend** → **Start verification**. Read the random prompt, e.g. *"Please blink."*
- **First, hold up the printed photo.** It can't blink → the check times out →
  **LIVENESS FAILED**.

> "A photo can't blink, smile, or turn on command — so it never even reaches
> recognition. This is what stops fake attendance."

## Scene 4 — Live recognition in < 1s (30s) ⭐

- Tap **Try again**, this time **you** complete the challenge (blink/smile/turn).
- It instantly recognizes you: **name + LIVE ✓ + score**, and a **latency badge in
  milliseconds**.

> "Liveness passed, then MobileFaceNet recognized me on-device in
> **X milliseconds** — far under one second. Everything so far has been **offline**."

## Scene 5 — Truly offline (20s) ⭐

- Pull down **airplane mode**. Mark attendance again — **it still works**.

> "Zero network. Recognition and attendance keep working — exactly the remote-site
> scenario."

## Scene 6 — Sync when the network returns (25s)

- Turn the network back on. On **Home** (or Settings) tap **Sync now**.
- Switch to the **dashboard** on screen: the new attendance rows **appear live**,
  with green **LIVE ✓** badges and the spoof attempt as **spoof ✗**.

> "Back online, the queued records sync to the server — idempotently, so retries
> never duplicate. Here they are arriving on the dashboard."

## Scene 7 — The proof (20s)

Show `poc/` results: run (or show) `python benchmark.py` output and the ROC curve.

> "On the standard LFW benchmark with the same model: **98.3% accuracy**,
> **ROC-AUC 0.99**, **13 ms** per recognition, **4.99 MB** model. Measured, not claimed."

---

## Laptop-only fallback (if the device build isn't ready)

Everything except the phone UI is demonstrable on the laptop:

```bash
# Webcam liveness + recognition (same pipeline, same model)
cd poc
python recognize.py enroll --name "You" --webcam
python recognize.py attendance --webcam      # random liveness challenge, then recognize
python benchmark.py --pairs 1000              # the accuracy/latency/size numbers
```

Plus the **server dashboard** (`http://localhost:4000`) seeded with `npm run seed`
shows the offline→cloud sync story. This guarantees a working demo of the core
innovation regardless of the native build.

---

## Requirement → scene map (for judges)

| Requirement | Shown in |
| --- | --- |
| Offline recognition | Scene 4, 5 |
| Liveness / anti-spoof | Scene 3, 4 |
| < 1 second | Scene 4 (latency badge) + Scene 7 |
| > 95% accuracy / lightweight | Scene 7 |
| Runs on a real phone | Scenes 1–6 |
| Offline → cloud sync | Scene 5 → 6 |
