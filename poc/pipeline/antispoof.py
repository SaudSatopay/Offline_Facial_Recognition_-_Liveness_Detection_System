"""Passive (texture-based) face anti-spoofing — optional 2nd liveness layer.

Wraps the Deep-Tree anti-spoof model (`FaceAntiSpoofing.tflite`, from
syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing): a 256x256x3 RGB crop
in [0,1] -> two [1,8] heads ('Identity' = class predictions, 'Identity_1' =
one-hot leaf-routing mask). The decision rule mirrors the reference:

    spoof_score = sum_i |pred_i| * mask_i
    score > 0.2  -> spoof / presentation attack
    score <= 0.2 -> live

This is meant to run AFTER the active blink/smile/head-turn challenge as a
passive double-check on the captured frame (texture cues a printed photo or a
replayed screen leave behind), not as the only defense.
"""
from __future__ import annotations

import os

import numpy as np

SPOOF_THRESHOLD = 0.2   # > threshold => attack (matches the reference app)
INPUT_SIZE = 256


def _load_interpreter(model_path: str):
    try:
        from ai_edge_litert.interpreter import Interpreter
    except Exception:  # pragma: no cover
        from tensorflow.lite import Interpreter  # type: ignore
    interp = Interpreter(model_path=model_path)
    interp.allocate_tensors()
    return interp


class FaceAntiSpoofing:
    def __init__(self, model_path: str):
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"{model_path} missing — fetch FaceAntiSpoofing.tflite "
                "(see docs/benchmarks/antispoofing.md)."
            )
        self.interp = _load_interpreter(model_path)
        self.inp = self.interp.get_input_details()[0]
        outs = self.interp.get_output_details()
        # 'Identity' (preds) sorts before 'Identity_1' (one-hot leaf mask).
        self.preds_out, self.mask_out = sorted(outs, key=lambda d: d["name"])

    def spoof_score(self, face_rgb: np.ndarray) -> float:
        """face_rgb: HxWx3 uint8 RGB face crop -> spoof score (higher = more spoofy)."""
        import cv2

        x = cv2.resize(face_rgb, (INPUT_SIZE, INPUT_SIZE)).astype(np.float32) / 255.0
        self.interp.set_tensor(self.inp["index"], np.expand_dims(x, 0))
        self.interp.invoke()
        preds = self.interp.get_tensor(self.preds_out["index"])[0]
        mask = self.interp.get_tensor(self.mask_out["index"])[0]
        return float(np.sum(np.abs(preds) * mask))

    def is_live(self, face_rgb: np.ndarray, threshold: float = SPOOF_THRESHOLD) -> bool:
        return self.spoof_score(face_rgb) <= threshold
