"""Face detection, landmarking, alignment and liveness signals via the
MediaPipe **Tasks** FaceLandmarker.

FaceLandmarker gives, per frame:
  * 478 3D landmarks  -> used for ArcFace 5-point alignment to a 112x112 crop
  * face blendshapes  -> eyeBlink / jawOpen / mouthSmile scores in [0,1], which
                         map directly onto the mobile app's MLKit signals
                         (eyeOpenProbability, smilingProbability, ...)
  * a transformation matrix (head pose) — head turn is also derived from
    landmarks via solvePnP in liveness.py.

Requires models/face_landmarker.task (fetched by download_models.py).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, Optional

import cv2
import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
_TASK_MODEL = os.path.normpath(os.path.join(_HERE, "..", "models", "face_landmarker.task"))

# ArcFace canonical 5 points for a 112x112 aligned face
# order: left-eye, right-eye, nose, left-mouth, right-mouth (image coords)
_ARCFACE_REF = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
     [41.5493, 92.3655], [70.7299, 92.2041]], dtype=np.float32,
)

_LEFT_EYE = [33, 133, 159, 145]    # image-left eye
_RIGHT_EYE = [362, 263, 386, 374]  # image-right eye
_NOSE_TIP = 1
_MOUTH_L = 61
_MOUTH_R = 291


@dataclass
class Detection:
    landmarks: np.ndarray              # (478, 2) pixel coords
    bbox: tuple                        # (x1, y1, x2, y2)
    image_size: tuple                  # (w, h)
    blendshapes: Dict[str, float] = field(default_factory=dict)
    transform: Optional[np.ndarray] = None  # 4x4 head-pose matrix


def _similarity_transform(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    M, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)
    if M is None:
        M, _ = cv2.estimateAffine2D(src, dst)
    return M


class FaceMeshDetector:
    """Thin wrapper over MediaPipe Tasks FaceLandmarker (IMAGE running mode)."""

    def __init__(self, static_image_mode: bool = True, max_num_faces: int = 1,
                 min_detection_confidence: float = 0.4, model_path: str = _TASK_MODEL):
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"{model_path} missing. Run `python download_models.py` first."
            )
        self._mp = mp
        opts = vision.FaceLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=model_path),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=max_num_faces,
            min_face_detection_confidence=min_detection_confidence,
            min_face_presence_confidence=min_detection_confidence,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )
        self.landmarker = vision.FaceLandmarker.create_from_options(opts)

    def detect(self, image_bgr: np.ndarray) -> Optional[Detection]:
        h, w = image_bgr.shape[:2]
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_img = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        res = self.landmarker.detect(mp_img)
        if not res.face_landmarks:
            return None
        lm = res.face_landmarks[0]
        pts = np.array([[p.x * w, p.y * h] for p in lm], dtype=np.float32)
        blend = {}
        if res.face_blendshapes:
            blend = {c.category_name: float(c.score) for c in res.face_blendshapes[0]}
        transform = None
        if res.facial_transformation_matrixes:
            transform = np.array(res.facial_transformation_matrixes[0])
        x1, y1 = pts[:, 0].min(), pts[:, 1].min()
        x2, y2 = pts[:, 0].max(), pts[:, 1].max()
        return Detection(pts, (x1, y1, x2, y2), (w, h), blend, transform)

    @staticmethod
    def five_points(landmarks: np.ndarray) -> np.ndarray:
        left_eye = landmarks[_LEFT_EYE].mean(axis=0)
        right_eye = landmarks[_RIGHT_EYE].mean(axis=0)
        return np.stack([left_eye, right_eye, landmarks[_NOSE_TIP],
                         landmarks[_MOUTH_L], landmarks[_MOUTH_R]]).astype(np.float32)

    def align(self, image_bgr: np.ndarray, det: Detection, size: int = 112) -> np.ndarray:
        """Return an aligned size x size RGB face crop ready for the embedder."""
        ref = _ARCFACE_REF.copy()
        if size != 112:
            ref *= size / 112.0
        M = _similarity_transform(self.five_points(det.landmarks), ref)
        aligned_bgr = cv2.warpAffine(image_bgr, M, (size, size), borderValue=0)
        return cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB)

    def close(self):
        self.landmarker.close()
