"""Liveness signals + challenge state machine.

A printed photo or a static screen cannot blink, open its mouth on demand, or
turn its head to a requested angle. We derive these signals geometrically from
FaceMesh landmarks and require the user to complete a *randomly chosen*
challenge, which defeats simple replay/photo spoofing.

This mirrors the mobile app, which gets the same signals from MLKit
(leftEyeOpenProbability / smilingProbability / head Euler angle).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List
import numpy as np

# --- landmark groups (FaceMesh indices) ------------------------------------
_R_EYE_V = (159, 145)   # right eye top / bottom lid
_R_EYE_H = (33, 133)    # right eye corners
_L_EYE_V = (386, 374)   # left eye top / bottom lid
_L_EYE_H = (362, 263)   # left eye corners
_MOUTH_V = (13, 14)     # inner upper / lower lip
_MOUTH_H = (61, 291)    # mouth corners

# thresholds for geometric ratios (used when blendshapes are unavailable)
EAR_OPEN = 0.23
EAR_CLOSED = 0.16
MAR_OPEN = 0.45
YAW_TURN = 18.0   # degrees

# thresholds for MediaPipe blendshape scores in [0,1] (preferred path; these map
# onto the mobile app's MLKit eyeOpenProbability / smilingProbability signals)
BS_BLINK_CLOSED = 0.50   # eyeBlink* score above this => eye closed
BS_BLINK_OPEN = 0.20     # below this => eye open again
BS_JAW_OPEN = 0.40       # jawOpen score => mouth open
BS_SMILE = 0.45          # mouthSmile* score => smiling


def _dist(p: np.ndarray, a: int, b: int) -> float:
    return float(np.linalg.norm(p[a] - p[b]))


def eye_aspect_ratio(landmarks: np.ndarray) -> float:
    """Average eye-aspect-ratio. Low value => eyes closed (blink)."""
    r = _dist(landmarks, *_R_EYE_V) / (_dist(landmarks, *_R_EYE_H) + 1e-6)
    l = _dist(landmarks, *_L_EYE_V) / (_dist(landmarks, *_L_EYE_H) + 1e-6)
    return (r + l) / 2.0


def mouth_aspect_ratio(landmarks: np.ndarray) -> float:
    """Vertical mouth opening / width. High value => mouth open."""
    return _dist(landmarks, *_MOUTH_V) / (_dist(landmarks, *_MOUTH_H) + 1e-6)


# 3D generic face model for head-pose estimation (mm), matched to the 2D
# landmarks below. Returned angles are degrees: yaw(+right) pitch(+down) roll.
_MODEL_3D = np.array(
    [
        (0.0, 0.0, 0.0),        # nose tip        (1)
        (0.0, -63.6, -12.5),    # chin            (152)
        (-43.3, 32.7, -26.0),   # left eye corner (33)
        (43.3, 32.7, -26.0),    # right eye corner(263)
        (-28.9, -28.9, -24.1),  # left mouth      (61)
        (28.9, -28.9, -24.1),   # right mouth     (291)
    ],
    dtype=np.float64,
)
_POSE_IDX = [1, 152, 33, 263, 61, 291]


def head_pose(landmarks: np.ndarray, image_size) -> tuple:
    """Return (yaw, pitch, roll) in degrees via solvePnP."""
    import cv2

    w, h = image_size
    image_pts = landmarks[_POSE_IDX].astype(np.float64)
    focal = float(w)
    cam = np.array([[focal, 0, w / 2.0], [0, focal, h / 2.0], [0, 0, 1]], dtype=np.float64)
    ok, rvec, _ = cv2.solvePnP(
        _MODEL_3D, image_pts, cam, np.zeros((4, 1)), flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not ok:
        return 0.0, 0.0, 0.0
    rot, _ = cv2.Rodrigues(rvec)
    sy = np.sqrt(rot[0, 0] ** 2 + rot[1, 0] ** 2)
    pitch = np.degrees(np.arctan2(-rot[2, 0], sy))
    yaw = np.degrees(np.arctan2(rot[1, 0], rot[0, 0]))
    roll = np.degrees(np.arctan2(rot[2, 1], rot[2, 2]))
    return float(yaw), float(pitch), float(roll)


def blink_score(blendshapes: dict) -> float:
    """Eye-closed score in [0,1] from blendshapes (avg of both eyes)."""
    return (blendshapes.get("eyeBlinkLeft", 0.0) + blendshapes.get("eyeBlinkRight", 0.0)) / 2.0


def smile_score(blendshapes: dict) -> float:
    return (blendshapes.get("mouthSmileLeft", 0.0) + blendshapes.get("mouthSmileRight", 0.0)) / 2.0


CHALLENGES = ("blink", "smile", "open_mouth", "turn_left", "turn_right")


@dataclass
class ChallengeResult:
    challenge: str
    passed: bool
    frames: int


@dataclass
class LivenessChallenge:
    """Frame-by-frame state machine that verifies one challenge is completed.

    Feed each frame's landmarks via `update`; it returns True once the active
    challenge is satisfied. `blink` needs an open->closed->open transition;
    `open_mouth` needs MAR above threshold; turns need yaw past threshold.
    """

    challenge: str
    _blink_stage: int = 0   # 0=waiting-open, 1=saw-closed
    frames: int = 0
    done: bool = False
    history: List[float] = field(default_factory=list)

    def update(self, landmarks: np.ndarray, image_size, blendshapes: dict = None) -> bool:
        """Advance the state machine with one frame.

        Prefers MediaPipe blendshape scores (blink/jaw/smile) when available and
        falls back to geometric ratios otherwise. Head turns always use solvePnP.
        """
        if self.done:
            return True
        self.frames += 1
        bs = blendshapes or {}

        if self.challenge == "blink":
            if bs:
                closed = blink_score(bs)
                self.history.append(closed)
                if self._blink_stage == 0 and closed > BS_BLINK_CLOSED:
                    self._blink_stage = 1
                elif self._blink_stage == 1 and closed < BS_BLINK_OPEN:
                    self.done = True
            else:
                ear = eye_aspect_ratio(landmarks)
                self.history.append(ear)
                if self._blink_stage == 0 and ear < EAR_CLOSED:
                    self._blink_stage = 1
                elif self._blink_stage == 1 and ear > EAR_OPEN:
                    self.done = True
        elif self.challenge == "smile":
            if smile_score(bs) > BS_SMILE:
                self.done = True
        elif self.challenge == "open_mouth":
            if (bs.get("jawOpen", 0.0) > BS_JAW_OPEN) or \
               (not bs and mouth_aspect_ratio(landmarks) > MAR_OPEN):
                self.done = True
        elif self.challenge in ("turn_left", "turn_right"):
            yaw, _, _ = head_pose(landmarks, image_size)
            if (self.challenge == "turn_left" and yaw < -YAW_TURN) or \
               (self.challenge == "turn_right" and yaw > YAW_TURN):
                self.done = True
        return self.done

    def result(self) -> ChallengeResult:
        return ChallengeResult(self.challenge, self.done, self.frames)
