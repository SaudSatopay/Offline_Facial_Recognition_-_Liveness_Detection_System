"""Robustness eval: recognition accuracy across degraded capture conditions.

Remote NHAI sites are the opposite of a studio — harsh midday glare, near-dark
gatehouses at night, dusty/low-end cameras, and workers glancing at the device
off-axis. A fair scalability claim has to show the recogniser still works when
the *probe* (the live scan) is degraded while the enrolled template stays clean.

So we take the LFW verification pairs, align both faces, keep image A as the
clean enrolled template, and apply a battery of realistic degradations to image
B (the "live scan") before embedding. For each condition we report:

  * accuracy at the deployed operating threshold (0.45) — the honest "does the
    shipped system still accept the right person" number,
  * accuracy at that condition's own optimal threshold,
  * ROC-AUC (threshold-independent separability),
  * genuine vs impostor mean cosine (how far the distributions drift).

Outputs: docs/benchmarks/conditions.json, conditions.png (accuracy + AUC bars),
and condition_montage.png (one face under every condition, for the deck).

Usage:
    python eval_conditions.py --pairs 600
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import cv2

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from pipeline import FaceEmbedder, FaceMeshDetector  # noqa: E402
from pipeline.matcher import DEFAULT_THRESHOLD  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "mobilefacenet.tflite")
OUT_DIR = os.path.join(HERE, "..", "docs", "benchmarks")

# Seeded so the sensor-noise condition is reproducible run-to-run.
RNG = np.random.default_rng(0)


# --------------------------------------------------------------------------- #
# Degradations — each maps a 112x112 uint8 RGB face crop to a degraded crop.   #
# Grouped by the real-world failure they emulate.                             #
# --------------------------------------------------------------------------- #
def _scale(img: np.ndarray, k: float) -> np.ndarray:
    return np.clip(img.astype(np.float32) * k, 0, 255).astype(np.uint8)


def _contrast(img: np.ndarray, k: float) -> np.ndarray:
    return np.clip((img.astype(np.float32) - 128.0) * k + 128.0, 0, 255).astype(np.uint8)


def _blur(img: np.ndarray, ksize: int) -> np.ndarray:
    return cv2.GaussianBlur(img, (ksize, ksize), 0)


def _noise(img: np.ndarray, sigma: float) -> np.ndarray:
    n = RNG.normal(0.0, sigma, img.shape)
    return np.clip(img.astype(np.float32) + n, 0, 255).astype(np.uint8)


def _downscale(img: np.ndarray, small: int) -> np.ndarray:
    h, w = img.shape[:2]
    lo = cv2.resize(img, (small, small), interpolation=cv2.INTER_AREA)
    return cv2.resize(lo, (w, h), interpolation=cv2.INTER_LINEAR)


def _jpeg(img: np.ndarray, quality: int) -> np.ndarray:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if ok else img


def _rotate(img: np.ndarray, deg: float) -> np.ndarray:
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), deg, 1.0)
    return cv2.warpAffine(img, M, (w, h), borderValue=(0, 0, 0))


# (label, group, fn) — order is the report order.
CONDITIONS = [
    ("baseline",        "reference", lambda x: x),
    ("bright_glare",    "lighting",  lambda x: _scale(x, 1.7)),
    ("low_light",       "lighting",  lambda x: _scale(x, 0.45)),
    ("very_low_light",  "lighting",  lambda x: _scale(x, 0.28)),
    ("low_contrast",    "lighting",  lambda x: _contrast(x, 0.45)),
    ("motion_blur",     "optics",    lambda x: _blur(x, 7)),
    ("downscale_40px",  "optics",    lambda x: _downscale(x, 40)),
    ("sensor_noise",    "sensor",    lambda x: _noise(x, 20.0)),
    ("jpeg_q18",        "sensor",    lambda x: _jpeg(x, 18)),
    ("pose_tilt_+12",   "pose",      lambda x: _rotate(x, 12)),
    ("pose_tilt_-12",   "pose",      lambda x: _rotate(x, -12)),
]


def load_lfw_pairs(n_pairs: int):
    from sklearn.datasets import fetch_lfw_pairs

    print("[lfw] loading verification pairs (cached after first run)...")
    data = fetch_lfw_pairs(subset="test", color=True, resize=1.0, slice_=None)
    pairs, labels = data.pairs, data.target  # (N,2,H,W,3) float[0,1]; 1=same
    if n_pairs and n_pairs < len(pairs):
        pos = np.where(labels == 1)[0]
        neg = np.where(labels == 0)[0]
        k = n_pairs // 2
        idx = np.concatenate([pos[:k], neg[:k]])
        pairs, labels = pairs[idx], labels[idx]
    print(f"[lfw] using {len(pairs)} pairs "
          f"({int(labels.sum())} same / {int((labels == 0).sum())} different)")
    return pairs, labels


def to_bgr(img_float: np.ndarray) -> np.ndarray:
    arr = img_float * 255.0 if img_float.max() <= 1.0 else img_float
    rgb = np.clip(arr, 0, 255).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def aligned_crop(img_float: np.ndarray, detector: FaceMeshDetector) -> np.ndarray:
    """Detect + ArcFace-align to a clean 112x112 RGB crop (center-crop fallback)."""
    bgr = to_bgr(img_float)
    det = detector.detect(bgr)
    if det is None:
        return cv2.cvtColor(cv2.resize(bgr, (112, 112)), cv2.COLOR_BGR2RGB)
    return detector.align(bgr, det)


def metrics_for(scores: np.ndarray, labels: np.ndarray) -> dict:
    from sklearn.metrics import roc_auc_score, roc_curve

    auc = float(roc_auc_score(labels, scores))
    _, _, thr = roc_curve(labels, scores)
    accs = [(((scores >= t).astype(int) == labels).mean(), float(t)) for t in thr]
    best_acc, best_thr = max(accs, key=lambda x: x[0])
    acc_op = float(((scores >= DEFAULT_THRESHOLD).astype(int) == labels).mean())
    return {
        "acc_operating": round(acc_op, 4),
        "acc_best": round(float(best_acc), 4),
        "best_threshold": round(best_thr, 4),
        "roc_auc": round(auc, 4),
        "genuine_mean": round(float(scores[labels == 1].mean()), 4),
        "impostor_mean": round(float(scores[labels == 0].mean()), 4),
    }


def save_montage(sample_crop: np.ndarray, path: str) -> None:
    cols = 4
    rows = int(np.ceil(len(CONDITIONS) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 2.0, rows * 2.2))
    for ax in axes.ravel():
        ax.axis("off")
    for ax, (label, group, fn) in zip(axes.ravel(), CONDITIONS):
        ax.imshow(fn(sample_crop.copy()))
        ax.set_title(f"{label}\n({group})", fontsize=8)
        ax.axis("off")
    fig.suptitle("Probe face under each simulated capture condition", fontsize=11)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def save_bars(results: list, path: str) -> None:
    names = [r["condition"] for r in results]
    acc = [r["acc_operating"] * 100 for r in results]
    auc = [r["roc_auc"] * 100 for r in results]
    x = np.arange(len(names))
    w = 0.4
    fig, ax = plt.subplots(figsize=(11, 4.5))
    ax.bar(x - w / 2, acc, w, label="accuracy @ 0.45", color="#FFB100")
    ax.bar(x + w / 2, auc, w, label="ROC-AUC", color="#5b8def")
    ax.axhline(95, color="k", ls="--", lw=0.8, alpha=0.5, label="95% target")
    ax.set_ylim(50, 101)
    ax.set_ylabel("percent")
    ax.set_title("MobileFaceNet recognition robustness vs. capture condition (LFW)")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=35, ha="right", fontsize=8)
    ax.legend(loc="lower left")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=600, help="number of LFW pairs")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    embedder = FaceEmbedder(MODEL_PATH)
    detector = FaceMeshDetector(static_image_mode=True)
    print(f"[model] {embedder}")

    pairs, labels = load_lfw_pairs(args.pairs)
    labels = np.asarray(labels)

    # Align once: clean template crop (A) and clean probe crop (B) per pair.
    print("[align] detecting + aligning faces (one pass)...")
    crops_a, crops_b = [], []
    for i, (a, b) in enumerate(pairs):
        crops_a.append(aligned_crop(a, detector))
        crops_b.append(aligned_crop(b, detector))
        if (i + 1) % 100 == 0:
            print(f"  ...{i + 1}/{len(pairs)} aligned")
    detector.close()

    # Templates (A) stay clean and are embedded once.
    emb_a = np.stack([embedder.embed(c) for c in crops_a])

    results = []
    for label, group, fn in CONDITIONS:
        emb_b = np.stack([embedder.embed(fn(c.copy())) for c in crops_b])
        scores = np.einsum("ij,ij->i", emb_a, emb_b).astype(np.float32)
        m = metrics_for(scores, labels)
        m.update({"condition": label, "group": group})
        results.append(m)
        print(f"  [{group:9s}] {label:16s} "
              f"acc@0.45={m['acc_operating']*100:5.1f}%  AUC={m['roc_auc']:.4f}  "
              f"gen/imp={m['genuine_mean']:+.3f}/{m['impostor_mean']:+.3f}")

    baseline = next(r for r in results if r["condition"] == "baseline")
    for r in results:
        r["acc_retention_vs_baseline"] = round(
            r["acc_operating"] / baseline["acc_operating"], 4
        )

    out = {
        "dataset": "LFW pairs (test subset, funneled)",
        "pairs_evaluated": int(len(pairs)),
        "protocol": "clean enrolled template (A) vs degraded live probe (B); "
                    "degradations applied to the aligned 112x112 crop",
        "operating_threshold": DEFAULT_THRESHOLD,
        "embedding_dim": embedder.out_dim,
        "model_size_mb": round(embedder.size_mb, 2),
        "conditions": results,
    }
    with open(os.path.join(OUT_DIR, "conditions.json"), "w") as f:
        json.dump(out, f, indent=2)

    # Visuals: a montage of the conditions + the accuracy/AUC bar chart.
    save_montage(crops_b[int(np.where(labels == 1)[0][0])],
                 os.path.join(OUT_DIR, "condition_montage.png"))
    save_bars(results, os.path.join(OUT_DIR, "conditions.png"))

    # Markdown table for pasting into docs.
    print("\n| Condition | Group | Acc @0.45 | Acc (best) | ROC-AUC | Retention |")
    print("| --- | --- | --- | --- | --- | --- |")
    for r in results:
        print(f"| {r['condition']} | {r['group']} | "
              f"{r['acc_operating']*100:.1f}% | {r['acc_best']*100:.1f}% | "
              f"{r['roc_auc']:.4f} | {r['acc_retention_vs_baseline']*100:.1f}% |")
    print(f"\n[ok] wrote conditions.json + conditions.png + condition_montage.png "
          f"to {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    main()
