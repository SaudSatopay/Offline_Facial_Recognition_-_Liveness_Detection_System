// Active-liveness challenge state machine. A printed photo or a screen can't
// blink, smile on demand, or turn — so requiring a randomly chosen action
// defeats the common attendance-spoofing methods. Signals come from MLKit
// (via react-native-vision-camera-face-detector): eye-open & smiling
// probabilities and head yaw angle.

export type Challenge = 'blink' | 'smile' | 'turn_head';

export const CHALLENGES: Challenge[] = ['blink', 'smile', 'turn_head'];

export const PROMPTS: Record<Challenge, string> = {
  blink: 'Please BLINK',
  smile: 'Please SMILE',
  turn_head: 'Turn your HEAD left or right',
};

export const HINTS: Record<Challenge, string> = {
  blink: 'Look at the camera and blink once',
  smile: 'Give a clear smile',
  turn_head: 'Slowly turn your head to one side',
};

export type FaceSignals = {
  hasFace: boolean;
  eyeOpen: number;   // 1 = open, 0 = closed (avg of both eyes)
  smile: number;     // 0..1
  yaw: number;       // degrees, signed
};

// thresholds
const EYE_CLOSED = 0.35;
const EYE_OPEN = 0.7;
const SMILE_ON = 0.6;
const YAW_TURN = 20;

export function pickChallenge(): Challenge {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

export class LivenessFSM {
  readonly challenge: Challenge;
  private blinkStage = 0; // 0 = waiting closed, 1 = saw closed (waiting open)
  done = false;

  constructor(challenge: Challenge) {
    this.challenge = challenge;
  }

  // Returns true once the challenge is satisfied.
  update(sig: FaceSignals): boolean {
    if (this.done) return true;
    if (!sig.hasFace) return false;

    switch (this.challenge) {
      case 'blink':
        if (this.blinkStage === 0 && sig.eyeOpen < EYE_CLOSED) this.blinkStage = 1;
        else if (this.blinkStage === 1 && sig.eyeOpen > EYE_OPEN) this.done = true;
        break;
      case 'smile':
        if (sig.smile > SMILE_ON) this.done = true;
        break;
      case 'turn_head':
        if (Math.abs(sig.yaw) > YAW_TURN) this.done = true;
        break;
    }
    return this.done;
  }
}
