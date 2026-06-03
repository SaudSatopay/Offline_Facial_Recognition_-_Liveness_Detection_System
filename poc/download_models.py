"""Download + verify the pre-trained MobileFaceNet TFLite model.

The model is a standard, widely-used MobileFaceNet (InsightFace/ArcFace loss),
~5 MB, 112x112x3 input -> embedding output. We download it, sanity-check the
I/O signature, then (optionally) copy it into the mobile app's assets so the
exact same weights ship on-device.
"""
from __future__ import annotations

import os
import shutil
import sys

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(HERE, "models")
MODEL_PATH = os.path.join(MODELS_DIR, "mobilefacenet.tflite")
LANDMARKER_PATH = os.path.join(MODELS_DIR, "face_landmarker.task")
MOBILE_ASSET = os.path.join(HERE, "..", "mobile", "assets", "models", "mobilefacenet.tflite")

# MediaPipe FaceLandmarker bundle (detection + 478 landmarks + blendshapes).
LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# Reliable public mirrors of the same MobileFaceNet weights.
SOURCES = [
    "https://github.com/MCarlomagno/FaceRecognitionAuth/raw/master/assets/mobilefacenet.tflite",
    "https://raw.githubusercontent.com/MCarlomagno/FaceRecognitionAuth/master/assets/mobilefacenet.tflite",
]


def download() -> str:
    os.makedirs(MODELS_DIR, exist_ok=True)
    if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1_000_000:
        print(f"[skip] model already present: {MODEL_PATH} "
              f"({os.path.getsize(MODEL_PATH)/1e6:.1f} MB)")
        return MODEL_PATH
    last_err = None
    for url in SOURCES:
        try:
            print(f"[download] {url}")
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            if len(r.content) < 1_000_000:
                raise ValueError(f"unexpectedly small file ({len(r.content)} bytes)")
            with open(MODEL_PATH, "wb") as f:
                f.write(r.content)
            print(f"[ok] saved {MODEL_PATH} ({len(r.content)/1e6:.1f} MB)")
            return MODEL_PATH
        except Exception as e:  # try next mirror
            print(f"[warn] {e}")
            last_err = e
    raise RuntimeError(f"all download sources failed: {last_err}")


def verify(path: str) -> None:
    try:
        from ai_edge_litert.interpreter import Interpreter
    except Exception:
        from tensorflow.lite import Interpreter  # type: ignore
    interp = Interpreter(model_path=path)
    interp.allocate_tensors()
    i = interp.get_input_details()[0]
    o = interp.get_output_details()[0]
    print("\n=== MobileFaceNet model signature ===")
    print(f"  input  shape={list(i['shape'])} dtype={i['dtype'].__name__}")
    print(f"  output shape={list(o['shape'])} dtype={o['dtype'].__name__}")
    print(f"  size   {os.path.getsize(path)/1e6:.2f} MB")
    assert len(i["shape"]) == 4 and i["shape"][1] == i["shape"][2], "expected square image input"
    print("  [ok] signature looks valid for MobileFaceNet")


def copy_to_mobile(path: str) -> None:
    dst_dir = os.path.dirname(MOBILE_ASSET)
    os.makedirs(dst_dir, exist_ok=True)
    shutil.copy2(path, MOBILE_ASSET)
    print(f"[ok] copied model into mobile app assets: {os.path.normpath(MOBILE_ASSET)}")


def download_landmarker() -> str:
    os.makedirs(MODELS_DIR, exist_ok=True)
    if os.path.exists(LANDMARKER_PATH) and os.path.getsize(LANDMARKER_PATH) > 1_000_000:
        print(f"[skip] landmarker already present "
              f"({os.path.getsize(LANDMARKER_PATH)/1e6:.1f} MB)")
        return LANDMARKER_PATH
    print(f"[download] {LANDMARKER_URL}")
    r = requests.get(LANDMARKER_URL, timeout=60)
    r.raise_for_status()
    with open(LANDMARKER_PATH, "wb") as f:
        f.write(r.content)
    print(f"[ok] saved {LANDMARKER_PATH} ({len(r.content)/1e6:.1f} MB)")
    return LANDMARKER_PATH


if __name__ == "__main__":
    p = download()
    verify(p)
    download_landmarker()
    if "--mobile" in sys.argv:
        copy_to_mobile(p)
