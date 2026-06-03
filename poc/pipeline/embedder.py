"""MobileFaceNet TFLite embedder.

Loads the same MobileFaceNet model the mobile app ships and turns an aligned
112x112 face crop into an L2-normalized embedding vector. Cosine similarity
between two embeddings is then a face-similarity score in [-1, 1].
"""
from __future__ import annotations

import os
import numpy as np


def _load_interpreter(model_path: str):
    """Return a TFLite interpreter, preferring the lightweight LiteRT runtime."""
    try:
        from ai_edge_litert.interpreter import Interpreter  # small, fast
    except Exception:  # pragma: no cover - fallback for envs without LiteRT
        from tensorflow.lite import Interpreter  # type: ignore
    interp = Interpreter(model_path=model_path)
    interp.allocate_tensors()
    return interp


class FaceEmbedder:
    """Wraps a MobileFaceNet .tflite model.

    The model input/output shapes and dtype are read from the model itself, so
    this works with 112x112 float32 MobileFaceNet variants (128-d or 192-d
    output) as well as quantized uint8 variants.
    """

    def __init__(self, model_path: str):
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model not found at {model_path}. Run `python download_models.py` first."
            )
        self.model_path = model_path
        self.interp = _load_interpreter(model_path)
        self.in_detail = self.interp.get_input_details()[0]
        self.out_detail = self.interp.get_output_details()[0]
        # input is [1, H, W, 3]
        _, self.in_h, self.in_w, _ = self.in_detail["shape"]
        self.in_dtype = self.in_detail["dtype"]
        self.out_dim = int(self.out_detail["shape"][-1])

    def __repr__(self) -> str:
        size_mb = os.path.getsize(self.model_path) / (1024 * 1024)
        return (
            f"FaceEmbedder(input={self.in_w}x{self.in_h}, dtype={self.in_dtype.__name__}, "
            f"embedding_dim={self.out_dim}, size={size_mb:.1f}MB)"
        )

    @property
    def size_mb(self) -> float:
        return os.path.getsize(self.model_path) / (1024 * 1024)

    def _preprocess(self, face_rgb: np.ndarray) -> np.ndarray:
        """face_rgb: HxWx3 uint8 RGB -> model input tensor."""
        import cv2

        if face_rgb.shape[0] != self.in_h or face_rgb.shape[1] != self.in_w:
            face_rgb = cv2.resize(face_rgb, (self.in_w, self.in_h))
        if np.issubdtype(self.in_dtype, np.integer):
            # quantized uint8 model: feed raw [0, 255]
            tensor = face_rgb.astype(self.in_dtype)
        else:
            # float model: normalize to [-1, 1]  (MobileFaceNet convention)
            tensor = (face_rgb.astype(np.float32) - 127.5) / 128.0
        return np.expand_dims(tensor, axis=0)

    def embed(self, face_rgb: np.ndarray) -> np.ndarray:
        """Return an L2-normalized embedding for an RGB face crop."""
        tensor = self._preprocess(face_rgb)
        self.interp.set_tensor(self.in_detail["index"], tensor)
        self.interp.invoke()
        vec = self.interp.get_tensor(self.out_detail["index"])[0].astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity for already-L2-normalized vectors (== dot product)."""
    return float(np.dot(a, b))
