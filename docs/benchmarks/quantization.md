# Int8 quantization — compressing the on-device model further

The shipped MobileFaceNet is already **4.99 MB** (≈4× under the 20 MB budget).
This experiment quantifies how much further int8 post-training quantization (PTQ)
shrinks it, and what it costs in accuracy — the compression headroom for even
more constrained edge hardware.

## A wrinkle: the shipped model is a legacy export

The shipped `mobilefacenet.tflite` is an old TF1-era conversion: batch-norm is
**unfused** and PReLU is **decomposed** into `Abs/Sub/Mul/Add`. Modern `.tflite`
post-training quantizers (we tried Google's **AI Edge Quantizer**) silently
no-op on it — the conv/depthwise weight buffers (4.86 MB of constants) are
present and standard, but the tool won't map this legacy graph and returns a
1.0× "quantized" model.

So we keep the **exact same weights** but route through a converter that handles
legacy graphs:

```
mobilefacenet.tflite --(tf2onnx)--> ONNX fp32 --(onnxruntime static QDQ int8)--> ONNX int8
```

Static QDQ quantization stores Conv weights as **per-channel int8** and quantizes
activations to **uint8** using calibration ranges measured on **real aligned face
crops**, while keeping **float32 I/O** (so preprocessing is unchanged and it runs
on ORT-CPU `QLinearConv` kernels — dynamic quant emits `ConvInteger`, which
ORT-CPU can't execute).

## Protocol

Both the fp32 and int8 ONNX models are scored on the **same** aligned LFW crops
(1000 pairs) the float pipeline uses, so the only variable is the quantization.
Crucially, the **fp32 ONNX reproduces the LiteRT baseline exactly**
(98.3% / 98.7% / AUC 0.9916) — confirming the conversion is faithful and the
int8 comparison is apples-to-apples.

## Results (LFW, 1000 pairs, operating threshold 0.45)

| Model | Size | Acc @0.45 | Acc (best) | ROC-AUC |
| --- | --- | --- | --- | --- |
| Float (LiteRT, shipped) | 4.99 MB | 98.3% | 98.7% | 0.9916 |
| Float (ONNX, converted) | 5.01 MB | 98.3% | 98.7% | 0.9916 |
| **Int8 (ONNX, QDQ)** | **1.76 MB** | **97.8%** | **98.5%** | **0.9928** |
| Δ int8 vs float | **2.85× smaller** | −0.5 pp | −0.2 pp | +0.1 pp |

**Takeaway:** int8 PTQ compresses the model **2.85×** to **1.76 MB** (~11× under
the 20 MB budget) for a **0.5 pp** accuracy cost — recognition stays at **97.8%**
with ROC-AUC **0.99**. The compression is below the naïve 4× because the unfused
batch-norm constants stay float; fusing the graph before quantization would close
that gap.

## Scope

This is a **POC demonstration** of the compression headroom. The verified
**float** model remains the shipping artifact in `mobile/` — deploying the int8
variant on-device would additionally need NNAPI/GPU int8 validation on the
target phone, which is the right next step but out of scope for this submission.

## Reproduce

```bash
# main venv (has MediaPipe + sklearn): dump aligned LFW crops
poc\.venv\Scripts\python.exe _dump_lfw_crops.py
# quant venv (see requirements-quant.txt): convert + int8 + benchmark
poc\.venv-quant\Scripts\python.exe quantize_onnx.py   # writes quantization.json
```
