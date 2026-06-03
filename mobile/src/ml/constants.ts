// Model + matching constants. Mirrors the validated Python reference (poc/).
export const MODEL_INPUT = 112;       // MobileFaceNet expects 112x112x3
export const EMBED_DIM = 192;         // output embedding dimensionality
export const MODEL_SIZE_MB = 4.99;

// Cosine decision threshold. LFW puts the balanced-optimal point at ~0.41; we
// use a slightly higher, security-leaning default (a rejected genuine user can
// retry). Tunable in Settings.
export const DEFAULT_THRESHOLD = 0.45;
