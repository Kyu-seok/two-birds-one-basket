/**
 * Fixed Loudness → Thrust mapping until Calibration exists.
 * Loudness is the RMS of the mic signal (0..1).
 */
export const FIXED_NOISE_FLOOR = 0.02;
export const FIXED_MAX_YELL = 0.25;

export function loudnessToThrust(loudness: number): number {
  const t = (loudness - FIXED_NOISE_FLOOR) / (FIXED_MAX_YELL - FIXED_NOISE_FLOOR);
  return Math.min(1, Math.max(0, t));
}
