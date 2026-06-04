// Embedding math: L2-normalize, cosine similarity, and 1:N identification.
// The raw MobileFaceNet output is not unit-length, so we normalize before
// storing (enroll) and before matching (recognize); cosine then == dot product.
import { GalleryEntry } from '../db/users';
import { DEFAULT_THRESHOLD } from './constants';

export function l2normalize(v: number[] | Float32Array): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Average several L2-normalized embeddings into one robust template (re-normalized).
// Used for multi-frame enrolment — a single frame is fragile.
export function averageEmbedding(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const sum = new Array(dim).fill(0);
  for (const e of embeddings) for (let i = 0; i < dim; i++) sum[i] += e[i];
  for (let i = 0; i < dim; i++) sum[i] /= embeddings.length;
  return l2normalize(sum);
}

export type Identification = {
  id: string | null;
  name: string | null;
  score: number;
  accepted: boolean;
};

// Brute-force 1:N search. The attendance gallery is small (tens–hundreds), so
// this is sub-millisecond — no vector index needed.
export function identify(
  embedding: number[],
  gallery: GalleryEntry[],
  threshold = DEFAULT_THRESHOLD,
): Identification {
  const query = l2normalize(embedding);
  let best: GalleryEntry | null = null;
  let bestScore = -1;
  for (const entry of gallery) {
    const score = cosineSimilarity(query, entry.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (!best) return { id: null, name: null, score: 0, accepted: false };
  return {
    id: best.id, name: best.name, score: bestScore, accepted: bestScore >= threshold,
  };
}
