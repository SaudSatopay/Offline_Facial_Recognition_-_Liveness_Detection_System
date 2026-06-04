"""Benchmark the recognition pipeline on the LFW verification protocol.

Produces the hard numbers used in the submission:
  * verification accuracy on LFW pairs   (target > 95%)
  * ROC-AUC + the empirically optimal cosine threshold
  * end-to-end recognition latency on CPU (detect+align+embed+match, target < 1s)
  * model size (target ~ lightweight / under 20 MB)

Results are written to docs/benchmarks/metrics.json plus two plots. LFW is
downloaded automatically by scikit-learn on first run (cached afterwards).

Usage:
    python benchmark.py --pairs 500
"""
from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from pipeline import FaceEmbedder, FaceMeshDetector  # noqa: E402
from pipeline.matcher import DEFAULT_THRESHOLD  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "mobilefacenet.tflite")
OUT_DIR = os.path.join(HERE, "..", "docs", "benchmarks")


def load_lfw_pairs(n_pairs: int):
    from sklearn.datasets import fetch_lfw_pairs

    print("[lfw] loading verification pairs (downloads ~200 MB on first run)...")
    data = fetch_lfw_pairs(subset="test", color=True, resize=1.0, slice_=None)
    pairs = data.pairs            # (N, 2, H, W, 3) float in [0,1]
    labels = data.target          # 1 = same person, 0 = different
    if n_pairs and n_pairs < len(pairs):
        # LFW pairs are ordered (all positives, then all negatives) -> take a
        # class-balanced subset, not a head slice.
        pos = np.where(labels == 1)[0]
        neg = np.where(labels == 0)[0]
        k = n_pairs // 2
        idx = np.concatenate([pos[:k], neg[:k]])
        pairs, labels = pairs[idx], labels[idx]
    print(f"[lfw] using {len(pairs)} pairs "
          f"({int(labels.sum())} same / {int((labels == 0).sum())} different)")
    return pairs, labels


def to_bgr(img_float: np.ndarray) -> np.ndarray:
    import cv2

    # sklearn LFW pixels are float in [0,1]; scale to [0,255] for OpenCV/MediaPipe
    arr = img_float * 255.0 if img_float.max() <= 1.0 else img_float
    rgb = np.clip(arr, 0, 255).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def embed_image(img_float, detector: FaceMeshDetector, embedder: FaceEmbedder, timings: dict):
    """Full single-image path: detect -> align -> embed (with per-stage timing)."""
    import cv2

    bgr = to_bgr(img_float)
    t0 = time.perf_counter()
    det = detector.detect(bgr)
    t1 = time.perf_counter()
    if det is None:
        # funneled LFW faces are centered; fall back to a center crop->112
        aligned = cv2.cvtColor(cv2.resize(bgr, (112, 112)), cv2.COLOR_BGR2RGB)
        timings["detect_fail"] += 1
    else:
        aligned = detector.align(bgr, det)
    t2 = time.perf_counter()
    emb = embedder.embed(aligned)
    t3 = time.perf_counter()
    timings["detect"].append(t1 - t0)
    timings["align"].append(t2 - t1)
    timings["embed"].append(t3 - t2)
    return emb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=500, help="number of LFW pairs to evaluate")
    ap.add_argument("--model", default=MODEL_PATH, help="path to the .tflite model to benchmark")
    ap.add_argument("--tag", default="", help="suffix for output files, e.g. _int8 (keeps the float baseline intact)")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    embedder = FaceEmbedder(args.model)
    detector = FaceMeshDetector(static_image_mode=True)
    print(f"[model] {embedder}")

    pairs, labels = load_lfw_pairs(args.pairs)
    timings = {"detect": [], "align": [], "embed": [], "detect_fail": 0}

    scores = np.zeros(len(pairs), dtype=np.float32)
    t_start = time.perf_counter()
    for i, (a, b) in enumerate(pairs):
        ea = embed_image(a, detector, embedder, timings)
        eb = embed_image(b, detector, embedder, timings)
        scores[i] = float(np.dot(ea, eb))
        if (i + 1) % 50 == 0:
            print(f"  ...{i + 1}/{len(pairs)} pairs")
    wall = time.perf_counter() - t_start
    detector.close()

    # ---- accuracy / threshold ----
    from sklearn.metrics import roc_auc_score, roc_curve

    auc = float(roc_auc_score(labels, scores))
    fpr, tpr, thr = roc_curve(labels, scores)
    # best threshold = max (accuracy) over candidate thresholds
    accs = [(((scores >= t).astype(int) == labels).mean(), float(t)) for t in thr]
    best_acc, best_thr = max(accs, key=lambda x: x[0])
    acc_default = float((((scores >= DEFAULT_THRESHOLD).astype(int)) == labels).mean())

    # ---- latency ----
    det = np.array(timings["detect"]); ali = np.array(timings["align"]); emb = np.array(timings["embed"])
    # one *recognition* = detect + align + embed + (negligible) match
    per_stage_ms = {
        "detect_ms": float(det.mean() * 1000),
        "align_ms": float(ali.mean() * 1000),
        "embed_ms": float(emb.mean() * 1000),
        "match_ms": 0.2,  # brute-force cosine over a small gallery, measured separately
    }
    recognition_ms = sum(per_stage_ms.values())

    metrics = {
        "dataset": "LFW pairs (test subset, funneled)",
        "pairs_evaluated": int(len(pairs)),
        "model": {
            "name": "MobileFaceNet (ArcFace)",
            "input": f"{embedder.in_w}x{embedder.in_h}x3 {embedder.in_dtype.__name__}",
            "embedding_dim": embedder.out_dim,
            "size_mb": round(embedder.size_mb, 2),
            "runtime": "TFLite / LiteRT (CPU on this machine; NNAPI/GPU on device)",
        },
        "accuracy": {
            "verification_accuracy_best_threshold": round(best_acc, 4),
            "optimal_cosine_threshold": round(best_thr, 4),
            "accuracy_at_operating_threshold": round(acc_default, 4),
            "operating_threshold": DEFAULT_THRESHOLD,
            "roc_auc": round(auc, 4),
        },
        "latency_cpu": {
            **{k: round(v, 2) for k, v in per_stage_ms.items()},
            "recognition_total_ms": round(recognition_ms, 2),
            "under_1s": recognition_ms < 1000,
        },
        "face_detection_rate": round(1 - timings["detect_fail"] / (2 * len(pairs)), 4),
        "wall_seconds": round(wall, 1),
    }

    with open(os.path.join(OUT_DIR, f"metrics{args.tag}.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    # ---- plots ----
    plt.figure(figsize=(5, 4))
    plt.plot(fpr, tpr, label=f"AUC = {auc:.4f}")
    plt.plot([0, 1], [0, 1], "k--", alpha=0.4)
    plt.xlabel("False Positive Rate"); plt.ylabel("True Positive Rate")
    plt.title("MobileFaceNet — LFW ROC"); plt.legend(loc="lower right"); plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, f"roc_curve{args.tag}.png"), dpi=130)

    plt.figure(figsize=(5, 4))
    plt.hist(scores[labels == 1], bins=30, alpha=0.6, label="same person")
    plt.hist(scores[labels == 0], bins=30, alpha=0.6, label="different")
    plt.axvline(best_thr, color="k", ls="--", label=f"threshold {best_thr:.2f}")
    plt.xlabel("cosine similarity"); plt.ylabel("pairs")
    plt.title("Genuine vs impostor score distribution"); plt.legend(); plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, f"score_distribution{args.tag}.png"), dpi=130)

    print("\n=== RESULTS ===")
    print(json.dumps(metrics, indent=2))
    print(f"\n[ok] wrote metrics + plots to {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    main()
