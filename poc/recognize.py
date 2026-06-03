"""Interactive demo for the offline face-recognition + liveness pipeline.

Subcommands
-----------
enroll      Register a face (from --image or the webcam) into the gallery.
identify    Recognise a face (from --image or the webcam).
attendance  Full secure flow: pass a random liveness challenge, THEN recognise
            and mark attendance. This is the demo that shows a photo is rejected
            (it cannot blink / open its mouth / turn) while a live person passes.
liveness    Just run the liveness challenge loop (no recognition).

Examples
--------
    python recognize.py enroll --name "Saud" --webcam
    python recognize.py attendance --webcam
    python recognize.py identify --image some_face.jpg
"""
from __future__ import annotations

import argparse
import os
import random
import time

import cv2
import numpy as np

from pipeline import FaceEmbedder, FaceMeshDetector, FaceDatabase
from pipeline import liveness as lv

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "mobilefacenet.tflite")
GALLERY_PATH = os.path.join(HERE, "gallery.json")

GREEN, RED, YELLOW, WHITE = (80, 220, 120), (60, 60, 235), (40, 210, 235), (240, 240, 240)


def _load(static: bool):
    embedder = FaceEmbedder(MODEL_PATH)
    detector = FaceMeshDetector(static_image_mode=static)
    db = FaceDatabase.load(GALLERY_PATH) if os.path.exists(GALLERY_PATH) else FaceDatabase()
    return embedder, detector, db


def _embed_frame(frame, detector, embedder):
    det = detector.detect(frame)
    if det is None:
        return None, None
    aligned = detector.align(frame, det)
    return embedder.embed(aligned), det


def _draw(frame, text, color=WHITE, y=40, scale=0.8):
    cv2.putText(frame, text, (20, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(frame, text, (20, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2, cv2.LINE_AA)


# --------------------------------------------------------------------------- enroll
def cmd_enroll(args):
    embedder, detector, db = _load(static=bool(args.image))
    if args.image:
        frame = cv2.imread(args.image)
        emb, det = _embed_frame(frame, detector, embedder)
        if emb is None:
            print("[err] no face found"); return
        db.enroll(args.name, emb); db.save(GALLERY_PATH)
        print(f"[ok] enrolled {args.name} from image. gallery size = {len(db)}")
        return
    cap = cv2.VideoCapture(0)
    print("[webcam] press SPACE to capture, Q to quit")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        emb, det = _embed_frame(frame, detector, embedder)
        if det is not None:
            x1, y1, x2, y2 = map(int, det.bbox)
            cv2.rectangle(frame, (x1, y1), (x2, y2), GREEN, 2)
        _draw(frame, f"Enroll '{args.name}'  -  SPACE=capture  Q=quit", YELLOW)
        cv2.imshow("enroll", frame)
        k = cv2.waitKey(1) & 0xFF
        if k == ord(" ") and emb is not None:
            db.enroll(args.name, emb); db.save(GALLERY_PATH)
            print(f"[ok] enrolled {args.name}. gallery size = {len(db)}")
            break
        if k == ord("q"):
            break
    cap.release(); cv2.destroyAllWindows(); detector.close()


# --------------------------------------------------------------------------- identify
def cmd_identify(args):
    embedder, detector, db = _load(static=bool(args.image))
    if len(db) == 0:
        print("[err] gallery empty - enroll someone first"); return
    if args.image:
        frame = cv2.imread(args.image)
        t0 = time.perf_counter()
        emb, det = _embed_frame(frame, detector, embedder)
        ms = (time.perf_counter() - t0) * 1000
        if emb is None:
            print("[err] no face found"); return
        m = db.identify(emb)
        print(f"[result] {'ACCEPT '+m.name if m.accepted else 'REJECT (unknown)'}"
              f"  score={m.score:.3f}  latency={ms:.0f}ms")
        return
    cap = cv2.VideoCapture(0)
    print("[webcam] Q to quit")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t0 = time.perf_counter()
        emb, det = _embed_frame(frame, detector, embedder)
        ms = (time.perf_counter() - t0) * 1000
        if det is not None:
            x1, y1, x2, y2 = map(int, det.bbox)
            m = db.identify(emb)
            color = GREEN if m.accepted else RED
            label = f"{m.name} ({m.score:.2f})" if m.accepted else f"UNKNOWN ({m.score:.2f})"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            _draw(frame, label, color)
            _draw(frame, f"{ms:.0f} ms", WHITE, y=75, scale=0.6)
        cv2.imshow("identify", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release(); cv2.destroyAllWindows(); detector.close()


# --------------------------------------------------------------------------- attendance
def cmd_attendance(args):
    """Liveness challenge -> recognition -> mark attendance."""
    embedder, detector, db = _load(static=False)
    if len(db) == 0:
        print("[err] gallery empty - enroll someone first"); return
    challenge = random.choice(lv.CHALLENGES)
    fsm = lv.LivenessChallenge(challenge)
    prompts = {
        "blink": "Please BLINK", "open_mouth": "Please OPEN your MOUTH",
        "turn_left": "Turn head LEFT", "turn_right": "Turn head RIGHT",
    }
    cap = cv2.VideoCapture(0)
    state, deadline = "LIVENESS", time.time() + 12
    result = None
    print(f"[attendance] challenge = {challenge}")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        det = detector.detect(frame)
        if state == "LIVENESS":
            _draw(frame, prompts[challenge], YELLOW)
            _draw(frame, "Liveness check (anti-spoofing)", WHITE, y=75, scale=0.55)
            if det is not None and fsm.update(det.landmarks, det.image_size, det.blendshapes):
                state = "RECOGNIZE"
            if time.time() > deadline:
                state = "FAIL_LIVE"
        elif state == "RECOGNIZE":
            t0 = time.perf_counter()
            aligned = detector.align(frame, det) if det is not None else None
            emb = embedder.embed(aligned) if aligned is not None else None
            ms = (time.perf_counter() - t0) * 1000
            if emb is not None:
                m = db.identify(emb)
                result = (m, ms)
                state = "DONE"
        elif state == "DONE":
            m, ms = result
            color = GREEN if m.accepted else RED
            _draw(frame, "LIVE  ✓", GREEN, y=40, scale=0.7)
            _draw(frame, f"{'ATTENDANCE: '+m.name if m.accepted else 'UNKNOWN FACE'}",
                  color, y=80)
            _draw(frame, f"score={m.score:.2f}  recog={ms:.0f}ms", WHITE, y=115, scale=0.55)
        elif state == "FAIL_LIVE":
            _draw(frame, "LIVENESS FAILED - spoof/timeout", RED)
        if det is not None:
            x1, y1, x2, y2 = map(int, det.bbox)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (200, 200, 200), 1)
        cv2.imshow("attendance", frame)
        k = cv2.waitKey(1) & 0xFF
        if k == ord("q") or (state in ("DONE", "FAIL_LIVE") and k == ord(" ")):
            break
    cap.release(); cv2.destroyAllWindows(); detector.close()


# --------------------------------------------------------------------------- liveness only
def cmd_liveness(args):
    _, detector, _ = _load(static=False)
    challenge = args.challenge or random.choice(lv.CHALLENGES)
    fsm = lv.LivenessChallenge(challenge)
    cap = cv2.VideoCapture(0)
    print(f"[liveness] challenge = {challenge}")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        det = detector.detect(frame)
        passed = fsm.update(det.landmarks, det.image_size, det.blendshapes) if det is not None else False
        if det is not None:
            blink = lv.blink_score(det.blendshapes)
            smile = lv.smile_score(det.blendshapes)
            jaw = det.blendshapes.get("jawOpen", 0.0)
            yaw, _, _ = lv.head_pose(det.landmarks, det.image_size)
            _draw(frame, f"blink={blink:.2f} smile={smile:.2f} jaw={jaw:.2f} yaw={yaw:.0f}",
                  WHITE, y=75, scale=0.5)
        _draw(frame, f"{challenge.upper()}: {'PASSED' if passed else '...'}",
              GREEN if passed else YELLOW)
        cv2.imshow("liveness", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release(); cv2.destroyAllWindows(); detector.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("enroll"); e.add_argument("--name", required=True)
    e.add_argument("--image"); e.add_argument("--webcam", action="store_true"); e.set_defaults(func=cmd_enroll)

    i = sub.add_parser("identify"); i.add_argument("--image")
    i.add_argument("--webcam", action="store_true"); i.set_defaults(func=cmd_identify)

    a = sub.add_parser("attendance"); a.add_argument("--webcam", action="store_true"); a.set_defaults(func=cmd_attendance)

    l = sub.add_parser("liveness"); l.add_argument("--challenge", choices=lv.CHALLENGES)
    l.add_argument("--webcam", action="store_true"); l.set_defaults(func=cmd_liveness)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
