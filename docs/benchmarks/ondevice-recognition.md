# On-device recognition — honest status, fixes, and limits

The rigorous, reproducible recognition benchmark for this project is the **POC**
(`poc/benchmark.py`): **98.3% on LFW**, ROC-AUC 0.9916, on the *same* MobileFaceNet
weights the app ships, with proper ArcFace alignment. This note is the honest
account of how recognition behaves **on the phone**, which is harder than the POC.

## Bugs found and fixed on-device

1. **Normalization bug (critical).** `vision-camera-resize-plugin` returns pixels
   in `0.0–1.0`, but the pipeline normalized them as if `0–255`
   (`(x-127.5)/128`). Every pixel collapsed to ≈ −0.99 — a flat image — so the
   model returned a **near-identical embedding for every face** (cosine ≈ 0.999
   between different people). Fixed by rescaling to 0–255 first. *This bug was the
   root cause of "everyone matches everyone."*
2. **No alignment → eye-based alignment.** MobileFaceNet (ArcFace) is
   alignment-sensitive; a raw bounding-box crop let framing/pose dominate the
   embedding. Added scale+center alignment on the inter-ocular line toward the
   ArcFace canonical layout.
3. **Single-frame → multi-frame enrolment.** Enrolment now averages 5 frames into
   one template (+ a frontal/eyes-open quality gate), reducing the impact of one
   bad capture.
4. **Hard duplicate-block → soft warning.** Similar-looking people (e.g. family)
   are different persons, so duplicate detection now *warns and lets the operator
   confirm* ("Enrol anyway") instead of refusing enrolment.

Net effect: on-device recognition went from **completely broken** (all faces
identical) to a **functional prototype** that reliably distinguishes *different,
unrelated* people — the real attendance use case.

## Honest limits

- **2D only.** The pipeline uses a single 2D RGB camera. The S24 has **no front
  depth sensor**, so true 3D face scanning (à la iPhone Face ID) is **not
  possible on this hardware** — it's a hardware limitation, not a software one.
- **Legacy model.** The bundled MobileFaceNet is an older, lightly-trained model.
  It clears LFW (98.3%) but is weak on hard cases.
- **First-degree relatives in open-set** (e.g. a parent vs. child who is *not*
  enrolled) can be confused — this is the **2D ceiling**; even commercial 2D
  systems struggle here. With both people enrolled, best-match resolves correctly.
- Recognition is sensitive to alignment/lighting; the decision threshold is
  **tunable in Config** (default 0.5).

## Upgrade path (not blockers in principle, blocked here by tooling/hardware)

- **Stronger model.** InsightFace **`w600k_mbf`** (MobileFaceNet trained on
  WebFace-600K, 512-d) is downloaded + ONNX-simplified in this repo's tooling. The
  only blocker is **ONNX→TFLite conversion crashing on Windows** (`onnx2tf` native
  crash, reproduced across numpy/TF versions). It converts cleanly on Linux →
  ship the `.tflite`, set `EMBED_DIM = 512`, keep the same `(x-127.5)/127.5`
  preprocessing. This is the single highest-impact upgrade.
- **3D / depth** would require depth hardware (IR dot-projector or ToF), which
  this device does not have.

## Bottom line

For **rigorous accuracy numbers, cite the POC (98.3% LFW)**. The on-device app is
a **working offline prototype** of the full pipeline (detect → liveness → align →
embed → match → sync) with the honest limits above and a concrete upgrade path.
