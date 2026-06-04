"""Int8-quantize the *shipped* MobileFaceNet and measure the accuracy cost.

The shipped `mobilefacenet.tflite` is a legacy TF1-era export (unfused batchnorm,
decomposed PReLU) that modern .tflite post-training quantizers silently skip. So
we keep the exact weights but route through a converter that handles legacy
graphs:

    tflite --(tf2onnx)--> ONNX (fp32) --(onnxruntime static QDQ)--> ONNX (int8)

Static QDQ quantization stores Conv weights as per-channel int8 and quantizes
activations to uint8 using calibration ranges measured on real face crops, while
keeping float32 I/O — so preprocessing is unchanged and the model runs on the
ORT-CPU QLinearConv kernels (dynamic quant emits ConvInteger, which ORT-CPU can't
execute). We then score BOTH the fp32 and int8 ONNX models on the *same* aligned
LFW crops the float pipeline uses (dumped by `_dump_lfw_crops.py` with the main
venv), so the only variable is the quantization.

Run in the quant venv (has tf2onnx + onnxruntime):
    poc\.venv-quant\Scripts\python.exe quantize_onnx.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
OUT_DIR = os.path.join(HERE, "..", "docs", "benchmarks")
TFLITE = os.path.join(MODELS, "mobilefacenet.tflite")
ONNX_FP32 = os.path.join(MODELS, "mobilefacenet.onnx")
ONNX_INT8 = os.path.join(MODELS, "mobilefacenet_int8.onnx")
CROPS = os.path.join(tempfile.gettempdir(), "lfw_crops.npz")
OPERATING_THRESHOLD = 0.45


def mb(path: str) -> float:
    return os.path.getsize(path) / (1024 * 1024)


def convert_to_onnx():
    print(f"[tf2onnx] {os.path.basename(TFLITE)} -> {os.path.basename(ONNX_FP32)}")
    subprocess.run(
        [sys.executable, "-m", "tf2onnx.convert", "--tflite", TFLITE,
         "--output", ONNX_FP32, "--opset", "13"],
        check=True,
    )


class _CropCalibrationReader:
    """Feeds preprocessed face crops to static quantization so it can measure
    real activation ranges (MobileFaceNet is Conv-heavy; dynamic quant emits
    ConvInteger which ORT-CPU can't run, so we use static QDQ + QLinearConv)."""

    def __init__(self, crops, input_name):
        self._input_name = input_name
        self._iter = iter(
            {input_name: np.expand_dims((c.astype(np.float32) - 127.5) / 128.0, 0)}
            for c in crops
        )

    def get_next(self):
        return next(self._iter, None)


def quantize(input_name, calib_crops):
    from onnxruntime.quantization import (
        quantize_static, QuantType, QuantFormat, CalibrationMethod,
    )
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = ONNX_FP32.replace(".onnx", "_pre.onnx")
    quant_pre_process(ONNX_FP32, pre)
    print(f"[onnxruntime] static int8 QDQ ({len(calib_crops)} calib crops) "
          f"-> {os.path.basename(ONNX_INT8)}")
    quantize_static(
        pre, ONNX_INT8,
        _CropCalibrationReader(calib_crops, input_name),
        quant_format=QuantFormat.QDQ,
        weight_type=QuantType.QInt8,        # per-channel int8 weights
        activation_type=QuantType.QUInt8,   # uint8 activations (best ORT-CPU support)
        per_channel=True,
        calibrate_method=CalibrationMethod.MinMax,
    )


def make_embedder(model_path):
    import onnxruntime as ort
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    shape = inp.shape
    nchw = (len(shape) == 4 and shape[1] == 3)  # else assume NHWC

    def embed(crop_uint8: np.ndarray) -> np.ndarray:
        x = (crop_uint8.astype(np.float32) - 127.5) / 128.0
        if nchw:
            x = np.transpose(x, (2, 0, 1))
        x = np.expand_dims(x, 0).astype(np.float32)
        vec = sess.run(None, {inp.name: x})[0][0].astype(np.float32)
        n = np.linalg.norm(vec)
        return vec / n if n > 0 else vec

    return embed


def accuracy(emb, a_crops, b_crops, labels):
    from sklearn.metrics import roc_auc_score, roc_curve
    scores = np.array(
        [float(np.dot(emb(a), emb(b))) for a, b in zip(a_crops, b_crops)],
        dtype=np.float32,
    )
    auc = float(roc_auc_score(labels, scores))
    _, _, thr = roc_curve(labels, scores)
    best = max((((scores >= t).astype(int) == labels).mean(), float(t)) for t in thr)
    acc_op = float(((scores >= OPERATING_THRESHOLD).astype(int) == labels).mean())
    return {
        "acc_operating": round(acc_op, 4),
        "acc_best": round(float(best[0]), 4),
        "best_threshold": round(best[1], 4),
        "roc_auc": round(auc, 4),
    }


def main():
    if not os.path.exists(CROPS):
        raise FileNotFoundError(
            f"{CROPS} missing — run `python _dump_lfw_crops.py` with the main venv first."
        )
    data = np.load(CROPS)
    a_crops, b_crops, labels = data["a"], data["b"], np.asarray(data["labels"])
    print(f"[crops] {len(labels)} LFW pairs "
          f"({int(labels.sum())} same / {int((labels == 0).sum())} different)")

    convert_to_onnx()
    import onnxruntime as ort
    input_name = ort.InferenceSession(
        ONNX_FP32, providers=["CPUExecutionProvider"]
    ).get_inputs()[0].name
    quantize(input_name, list(b_crops[:200]))

    print("[bench] scoring fp32 ONNX ...")
    m_fp32 = accuracy(make_embedder(ONNX_FP32), a_crops, b_crops, labels)
    print("[bench] scoring int8 ONNX ...")
    m_int8 = accuracy(make_embedder(ONNX_INT8), a_crops, b_crops, labels)

    out = {
        "note": "int8 = onnxruntime static QDQ quantization (per-channel int8 weights, "
                "uint8 activations, calibrated on real face crops) of the shipped "
                "MobileFaceNet weights, converted via tf2onnx. Same aligned LFW crops "
                "score both models; float32 I/O.",
        "pairs_evaluated": int(len(labels)),
        "operating_threshold": OPERATING_THRESHOLD,
        "size_mb": {
            "tflite_float_shipped": round(mb(TFLITE), 2),
            "onnx_float": round(mb(ONNX_FP32), 2),
            "onnx_int8": round(mb(ONNX_INT8), 2),
            "compression_x": round(mb(ONNX_FP32) / mb(ONNX_INT8), 2),
        },
        "accuracy_float_onnx": m_fp32,
        "accuracy_int8_onnx": m_int8,
        "accuracy_delta_pp": {
            "acc_operating": round((m_int8["acc_operating"] - m_fp32["acc_operating"]) * 100, 2),
            "acc_best": round((m_int8["acc_best"] - m_fp32["acc_best"]) * 100, 2),
            "roc_auc": round((m_int8["roc_auc"] - m_fp32["roc_auc"]) * 100, 2),
        },
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "quantization.json"), "w") as f:
        json.dump(out, f, indent=2)

    print("\n=== QUANTIZATION RESULTS ===")
    print(json.dumps(out, indent=2))
    print(f"\n[ok] wrote {os.path.normpath(os.path.join(OUT_DIR, 'quantization.json'))}")


if __name__ == "__main__":
    main()
