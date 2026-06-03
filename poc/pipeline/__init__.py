"""Reference face-recognition + liveness pipeline (NHAI Hackathon 2025).

This Python package is the runnable reference implementation that mirrors the
on-device React Native pipeline in ../mobile. It uses the *same* MobileFaceNet
TFLite model the mobile app ships, so accuracy/latency numbers measured here are
representative of the mobile build.

Stages:
    detector.FaceMeshDetector   -> find + align a face (MediaPipe FaceMesh)
    liveness                    -> blink / mouth-open / head-turn checks
    embedder.FaceEmbedder       -> 112x112 face -> L2-normalized embedding
    matcher.FaceDatabase        -> enroll + cosine identification
"""

from .embedder import FaceEmbedder
from .detector import FaceMeshDetector
from .matcher import FaceDatabase
from . import liveness

__all__ = ["FaceEmbedder", "FaceMeshDetector", "FaceDatabase", "liveness"]
