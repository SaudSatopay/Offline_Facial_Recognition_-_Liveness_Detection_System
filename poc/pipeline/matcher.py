"""In-memory + JSON-persisted face database with cosine identification.

For an attendance use-case the enrolled set is small (tens to low hundreds), so
a brute-force cosine search over normalized embeddings is sub-millisecond and
needs no vector index. The mobile app does the identical match in JS over
expo-sqlite rows.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional

import numpy as np

# Default decision threshold for MobileFaceNet cosine similarity. The LFW
# benchmark puts the balanced-optimal point at ~0.41; we use a slightly higher,
# security-leaning 0.45 to keep the impostor false-accept rate low for
# attendance (a rejected genuine user can simply retry). Tunable in Settings.
DEFAULT_THRESHOLD = 0.45


@dataclass
class Identity:
    name: str
    embedding: List[float]


@dataclass
class Match:
    name: Optional[str]
    score: float
    accepted: bool


class FaceDatabase:
    def __init__(self, threshold: float = DEFAULT_THRESHOLD):
        self.threshold = threshold
        self._db: Dict[str, np.ndarray] = {}

    # ---- enrollment -------------------------------------------------------
    def enroll(self, name: str, embedding: np.ndarray) -> None:
        """Enroll/replace an identity. Averaging multiple embeddings improves
        robustness, so if the name exists we mean-combine and re-normalize."""
        emb = np.asarray(embedding, dtype=np.float32)
        if name in self._db:
            emb = (self._db[name] + emb) / 2.0
            emb = emb / (np.linalg.norm(emb) + 1e-9)
        self._db[name] = emb

    @property
    def names(self) -> List[str]:
        return list(self._db.keys())

    def __len__(self) -> int:
        return len(self._db)

    # ---- identification ---------------------------------------------------
    def identify(self, embedding: np.ndarray) -> Match:
        """1:N search — return the best matching enrolled identity."""
        if not self._db:
            return Match(None, 0.0, False)
        query = np.asarray(embedding, dtype=np.float32)
        names = list(self._db.keys())
        mat = np.stack([self._db[n] for n in names])  # (N, D), already normalized
        scores = mat @ query                          # cosine similarities
        best = int(np.argmax(scores))
        score = float(scores[best])
        return Match(names[best], score, score >= self.threshold)

    @staticmethod
    def verify(emb_a: np.ndarray, emb_b: np.ndarray, threshold: float = DEFAULT_THRESHOLD) -> Match:
        """1:1 verification between two embeddings."""
        score = float(np.dot(emb_a, emb_b))
        return Match("same" if score >= threshold else "different", score, score >= threshold)

    # ---- persistence ------------------------------------------------------
    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        data = {
            "threshold": self.threshold,
            "identities": [asdict(Identity(n, self._db[n].tolist())) for n in self._db],
        }
        with open(path, "w") as f:
            json.dump(data, f)

    @classmethod
    def load(cls, path: str) -> "FaceDatabase":
        with open(path) as f:
            data = json.load(f)
        db = cls(threshold=data.get("threshold", DEFAULT_THRESHOLD))
        for ident in data["identities"]:
            db._db[ident["name"]] = np.asarray(ident["embedding"], dtype=np.float32)
        return db
