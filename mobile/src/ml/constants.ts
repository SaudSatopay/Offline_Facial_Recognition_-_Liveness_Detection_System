// Model + matching constants. Mirrors the validated Python reference (poc/).
export const MODEL_INPUT = 112;       // MobileFaceNet expects 112x112x3
export const EMBED_DIM = 192;         // output embedding dimensionality
export const MODEL_SIZE_MB = 4.99;

// Cosine decision threshold for the ON-DEVICE pipeline. The mobile crop uses
// eye-based scale+center alignment (no rotational warp), so its embeddings sit at
// a higher similarity baseline than the fully-aligned POC (where ~0.41 is
// optimal): on device, genuine matches land clearly higher than different faces,
// so we use a higher operating point. Tunable in Config.
export const DEFAULT_THRESHOLD = 0.5;

// Stricter threshold for blocking duplicate enrolment of the same face. Set
// above the recognition threshold so different (even similar-looking) people are
// not falsely blocked — we only block when the new face clearly matches someone
// already enrolled.
export const DUP_THRESHOLD = 0.55;

// How many frames to average into one enrolment template (a single frame is
// fragile; averaging reduces sensor noise and the impact of one bad capture).
export const ENROLL_FRAMES = 5;
