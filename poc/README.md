# POC — Python Reference Implementation

A fully **runnable** reference of the offline face-recognition + liveness
pipeline. It uses the **same MobileFaceNet `.tflite` model the mobile app ships**,
so the accuracy and latency measured here are representative of the on-device
build. This exists to *prove the core AI works* with hard numbers, independent
of any mobile build.

## Pipeline

```
frame ──► FaceLandmarker (MediaPipe Tasks)
             ├─ 478 landmarks ──► ArcFace 5-point align ──► 112×112 crop
             │                                                   │
             │                                                   ▼
             ├─ blendshapes (eyeBlink / jawOpen / mouthSmile) ─► MobileFaceNet.tflite
             └─ head pose (solvePnP)                              │  192-d embedding
                     │                                            ▼
                     ▼                                     cosine match vs gallery
              liveness challenge (blink/smile/                    │
              open-mouth/turn) — anti-spoofing             accept / reject
```

Code map:
| File | Responsibility |
| --- | --- |
| `pipeline/detector.py` | MediaPipe Tasks FaceLandmarker → landmarks, blendshapes, alignment |
| `pipeline/embedder.py` | MobileFaceNet TFLite → L2-normalized embedding |
| `pipeline/liveness.py` | EAR / MAR / head-pose + blendshape challenge state machine |
| `pipeline/matcher.py` | enrollment gallery + cosine 1:N identification |
| `download_models.py` | fetch + verify the two model files |
| `benchmark.py` | LFW accuracy + latency + model-size report |
| `recognize.py` | interactive webcam demo (enroll / identify / attendance / liveness) |

## Setup

```bash
cd poc
python -m venv .venv
# Windows:  .\.venv\Scripts\activate     |  macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
pip install ai-edge-litert          # TFLite/LiteRT runtime (or: pip install tensorflow)
python download_models.py           # downloads MobileFaceNet (~5 MB) + FaceLandmarker (~3.8 MB)
```
> Exact, known-good versions are pinned in `requirements-lock.txt`.

## Reproduce the benchmark

```bash
python benchmark.py --pairs 1000     # standard LFW test protocol
```
This downloads LFW via scikit-learn (first run only) and writes
`../docs/benchmarks/metrics.json`, `roc_curve.png`, `score_distribution.png`.

### Measured results (LFW, 1000 pairs, this machine's CPU)

| Metric | Result |
| --- | --- |
| Verification accuracy (best threshold) | **98.7%** |
| Accuracy at operating threshold 0.45 | **98.3%** |
| ROC-AUC | **0.9916** |
| Face-detection rate | **99.85%** |
| Recognition latency (detect+align+embed+match) | **13.2 ms** |
| Model size | **4.99 MB** |

> Latency is measured on a laptop **CPU**. On a phone the same TFLite model runs
> through the NNAPI/GPU delegate; expect tens of milliseconds — still far under
> the 1-second budget. Accuracy is dataset-dependent but LFW is the standard
> face-verification benchmark and is directly comparable to published numbers.

## Live webcam demos

```bash
python recognize.py enroll --name "Saud" --webcam   # SPACE to capture
python recognize.py attendance --webcam             # liveness → recognize → mark
python recognize.py identify  --webcam              # continuous recognition
python recognize.py liveness  --challenge blink     # just the anti-spoof check
```

The `attendance` flow is the security showcase: it issues a **random** liveness
challenge first. A printed photo or a phone screen cannot blink / open its mouth
/ turn on demand, so it never reaches the recognition stage — defeating the most
common attendance-fraud method.
