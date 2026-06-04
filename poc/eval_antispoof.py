"""Evaluate the passive anti-spoof model on real vs. spoof faces.

Feeds real and presentation-attack (print/replay) face crops through
FaceAntiSpoofing.tflite and reports the two numbers that matter for a 2nd
liveness layer:
  * live-pass   — fraction of REAL faces accepted (1 - false-reject)
  * spoof-reject — fraction of SPOOF faces caught (true-positive on attacks)
plus balanced accuracy + ROC-AUC and the best-balanced threshold.

Point --data at a folder whose images live under .../real/... and .../spoof/...
(e.g. LCC-FASD). Run with the MAIN venv (needs OpenCV + sklearn + matplotlib).

Usage:
    python eval_antispoof.py --data <dataset_root> --per-class 400
"""
from __future__ import annotations

import argparse
import glob
import json
import os

import numpy as np
import cv2

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from pipeline.antispoof import FaceAntiSpoofing, SPOOF_THRESHOLD  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "models", "FaceAntiSpoofing.tflite")
OUT_DIR = os.path.join(HERE, "..", "docs", "benchmarks")
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")


def label_of(path: str):
    """0 = real/live, 1 = spoof/attack, None = unknown (by folder name)."""
    for part in reversed(path.lower().replace("\\", "/").split("/")):
        if any(k in part for k in ("spoof", "fake", "attack", "print", "replay")):
            return 1
        if any(k in part for k in ("real", "live", "genuine")):
            return 0
    return None


def _read_list(txt_paths, index):
    out = []
    for t in txt_paths:
        with open(t) as f:
            for line in f:
                name = os.path.basename(line.strip().replace("\\", "/"))
                if name in index:
                    out.append(index[name])
    return out


def collect(root: str):
    imgs = [p for p in glob.glob(os.path.join(root, "**", "*.*"), recursive=True)
            if p.lower().endswith(IMG_EXT)]
    # LCC-FASD / NUAA style: explicit CLIENT (real) / IMPOSTER (spoof) label lists
    # take priority over folder/filename guessing (filenames here are misleading).
    client = glob.glob(os.path.join(root, "**", "CLIENT_*.txt"), recursive=True)
    imposter = glob.glob(os.path.join(root, "**", "IMPOSTER_*.txt"), recursive=True)
    if client and imposter:
        index = {os.path.basename(p): p for p in imgs}
        return _read_list(client, index), _read_list(imposter, index)
    # fallback: infer class from folder names
    real, spoof = [], []
    for p in imgs:
        lab = label_of(p)
        if lab == 0:
            real.append(p)
        elif lab == 1:
            spoof.append(p)
    return real, spoof


def score_paths(asf, paths):
    out = []
    for p in paths:
        img = cv2.imread(p)
        if img is None:
            continue
        out.append(asf.spoof_score(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    return np.array(out, dtype=np.float32)


def best_balanced_threshold(real, spoof):
    cand = np.unique(np.concatenate([real, spoof]))
    best = (0.0, SPOOF_THRESHOLD)
    for t in cand:
        bal = ((real <= t).mean() + (spoof > t).mean()) / 2
        if bal > best[0]:
            best = (float(bal), float(t))
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="dataset root with real/ and spoof/ images")
    ap.add_argument("--per-class", type=int, default=400)
    args = ap.parse_args()

    asf = FaceAntiSpoofing(MODEL)
    real_paths, spoof_paths = collect(args.data)
    print(f"[data] found {len(real_paths)} real / {len(spoof_paths)} spoof images")
    if not real_paths or not spoof_paths:
        raise SystemExit("need both real and spoof images — check --data layout")

    rng = np.random.default_rng(0)
    real_paths = [real_paths[i] for i in rng.permutation(len(real_paths))[:args.per_class]]
    spoof_paths = [spoof_paths[i] for i in rng.permutation(len(spoof_paths))[:args.per_class]]

    real = score_paths(asf, real_paths)
    spoof = score_paths(asf, spoof_paths)

    live_pass = float((real <= SPOOF_THRESHOLD).mean())
    spoof_reject = float((spoof > SPOOF_THRESHOLD).mean())
    from sklearn.metrics import roc_auc_score
    labels = np.concatenate([np.zeros(len(real)), np.ones(len(spoof))])
    scores = np.concatenate([real, spoof])
    auc = float(roc_auc_score(labels, scores))
    bal_best, thr_best = best_balanced_threshold(real, spoof)

    out = {
        "model": "FaceAntiSpoofing.tflite (Deep-Tree, 256x256 -> spoof score)",
        "dataset": os.path.basename(os.path.normpath(args.data)),
        "counts": {"real": int(len(real)), "spoof": int(len(spoof))},
        "operating_threshold": SPOOF_THRESHOLD,
        "at_operating_threshold": {
            "live_pass": round(live_pass, 4),
            "spoof_reject": round(spoof_reject, 4),
            "balanced_acc": round((live_pass + spoof_reject) / 2, 4),
        },
        "roc_auc": round(auc, 4),
        "best_balanced": {"threshold": round(thr_best, 4), "balanced_acc": round(bal_best, 4),
                          "live_pass": round(float((real <= thr_best).mean()), 4),
                          "spoof_reject": round(float((spoof > thr_best).mean()), 4)},
        "score_means": {"real": round(float(real.mean()), 4), "spoof": round(float(spoof.mean()), 4)},
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "antispoofing.json"), "w") as f:
        json.dump(out, f, indent=2)

    # score histogram
    plt.figure(figsize=(6, 4))
    plt.hist(real, bins=30, alpha=0.6, label="real", color="#2e9e5b")
    plt.hist(spoof, bins=30, alpha=0.6, label="spoof", color="#d9534f")
    plt.axvline(SPOOF_THRESHOLD, color="k", ls="--", label=f"threshold {SPOOF_THRESHOLD}")
    plt.xlabel("spoof score"); plt.ylabel("faces"); plt.legend()
    plt.title("Passive anti-spoof — real vs. spoof score distribution")
    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "antispoofing_scores.png"), dpi=130)
    plt.close()

    print("\n=== ANTI-SPOOF RESULTS ===")
    print(json.dumps(out, indent=2))
    print(f"\n[ok] wrote antispoofing.json + 2 plots to {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    main()
