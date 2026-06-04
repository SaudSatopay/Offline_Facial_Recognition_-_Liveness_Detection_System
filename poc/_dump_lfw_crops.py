"""Helper: dump aligned LFW face crops so the int8/ONNX benchmark (which runs in
the isolated quant venv, without MediaPipe) can score the *same* faces the float
pipeline sees. Run with the MAIN venv. Writes an .npz to the OS temp dir.
"""
from __future__ import annotations

import os
import tempfile

import numpy as np

from eval_conditions import load_lfw_pairs, aligned_crop
from pipeline import FaceMeshDetector

OUT = os.path.join(tempfile.gettempdir(), "lfw_crops.npz")


def main(n_pairs: int = 1000):
    pairs, labels = load_lfw_pairs(n_pairs)
    det = FaceMeshDetector(static_image_mode=True)
    a_crops, b_crops = [], []
    for i, (a, b) in enumerate(pairs):
        a_crops.append(aligned_crop(a, det))
        b_crops.append(aligned_crop(b, det))
        if (i + 1) % 200 == 0:
            print(f"  ...{i + 1}/{len(pairs)} aligned")
    det.close()
    np.savez_compressed(
        OUT,
        a=np.asarray(a_crops, dtype=np.uint8),
        b=np.asarray(b_crops, dtype=np.uint8),
        labels=np.asarray(labels),
    )
    print(f"[ok] wrote {OUT}  ({len(labels)} pairs)")


if __name__ == "__main__":
    main()
