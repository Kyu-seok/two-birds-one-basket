/**
 * Loudness → Thrust mapping until Calibration exists.
 * Loudness is the RMS of the mic signal (0..1). It is mapped on a decibel scale,
 * which matches how loud a voice sounds. Each player picks a Sensitivity: higher
 * means a quieter voice already gives full Thrust.
 */

/** The decibel window that maps to Thrust 0..1. */
export interface ThrustRange {
  /** At or below this, Thrust is 0. */
  floorDb: number;
  /** At or above this, Thrust is 1. */
  fullDb: number;
}

export const SENSITIVITY_MIN = 1;
export const SENSITIVITY_MAX = 10;
export const SENSITIVITY_DEFAULT = 6;
/** How many dB of voice span the whole Thrust range. */
const RANGE_WIDTH_DB = 20;

/**
 * Sensitivity 1 needs a firm voice (full at −22 dB); 6 is a normal speaking voice
 * (full at −39 dB); 10 is a near-whisper (full at −53 dB, where room noise may count too).
 */
export function rangeForSensitivity(sensitivity: number): ThrustRange {
  const s = Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, sensitivity));
  const fullDb = -18.5 - 3.5 * s;
  return { floorDb: fullDb - RANGE_WIDTH_DB, fullDb };
}

/** Loudness in dBFS (0 dB = the loudest a mic can record). */
export function loudnessToDb(loudness: number): number {
  return 20 * Math.log10(Math.max(loudness, 1e-5));
}

export function loudnessToThrust(
  loudness: number,
  range: ThrustRange = rangeForSensitivity(SENSITIVITY_DEFAULT),
): number {
  const t = (loudnessToDb(loudness) - range.floorDb) / (range.fullDb - range.floorDb);
  return Math.min(1, Math.max(0, t));
}
