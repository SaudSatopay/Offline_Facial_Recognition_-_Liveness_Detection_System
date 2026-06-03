<div align="center">

# 🛡️ Offline Facial Recognition & Liveness Detection System

### Secure, on-device face authentication for remote zero-network locations

**NHAI Hackathon 2025** — *Develop a Secure Offline Facial Recognition & Liveness Detection System for Remote Locations*

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue)](#)
[![Framework](https://img.shields.io/badge/React%20Native-Expo-000020)](#)
[![Models](https://img.shields.io/badge/AI%20models-~5%20MB%20TFLite-success)](#)
[![Offline](https://img.shields.io/badge/works-100%25%20offline-brightgreen)](#)
[![Speed](https://img.shields.io/badge/auth-%3C1%20second-orange)](#)

</div>

---

## The Challenge

Build an AI system that can **recognize faces offline**, **detect fake attendance** using liveness checks, run on **normal mid-range phones (3 GB RAM)** in **zero-network locations**, using **lightweight (~20 MB) AI models**, achieving **>95% accuracy** — all in **under 1 second**.

## What This Project Delivers

| ✅ Requirement | How we meet it |
| --- | --- |
| Recognize faces **offline** | On-device MobileFaceNet TFLite embeddings + local vector match — zero network |
| Detect **fake attendance** | Active liveness: blink / smile / head-turn challenge–response (a photo can't comply) |
| Run on **normal phones** | TFLite with NNAPI/GPU delegate; ~5 MB model footprint |
| Work in **remote / no-network** | Fully offline-first; results queued and synced when connectivity returns |
| Authenticate in **< 1 second** | Detect → embed → match ≈ 50–150 ms on mid-range hardware |
| **Lightweight** models | MobileFaceNet ≈ 5 MB (well under the 20 MB budget) |
| **> 95%** accuracy | MobileFaceNet (ArcFace loss) ≈ 99% on LFW — benchmarked in `/poc` |
| **React Native**, Android & iOS | Expo (prebuild) app with native frame-processor ML pipeline |
| **Offline → cloud sync** | Local SQLite + sync queue → self-hosted Node + SQLite server |

## Repository Layout

```
mobile/   →  Expo React Native app  (the on-device product)
poc/      →  Python reference implementation + benchmarks (runnable proof)
server/   →  Node + SQLite offline→cloud sync backend
docs/     →  Architecture, demo script, benchmark results, screenshots
```

> 📋 Full architecture, benchmark numbers, and run instructions are being added as the build progresses. See [`docs/`](docs/).

---

<div align="center">
Built for the NHAI Hackathon 2025.
</div>
