/**
 * Loudness → Thrust mapping. After Calibration, `calibratedRange` sets the range;
 * before it, `rangeForSensitivity` gives a fixed default.
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

/** A player's Calibration: their Noise Floor and Full Voice, in dBFS. */
export interface Calibration {
  noiseFloorDb: number;
  fullVoiceDb: number;
}

/** `tooClose`: the voice step was too near the Noise Floor (a noisy room or a quiet voice) to control a Bird. */
export type CalibrationResult = { ok: true; calibration: Calibration } | { ok: false; reason: "tooClose" };

/** Room noise this far above the measured Noise Floor still gives no Thrust. */
export const NOISE_MARGIN_DB = 5;
/** Full Voice must be at least this far above the Noise Floor. */
export const MIN_VOICE_SPAN_DB = 10;

/** The value below which `p` (0..1) of the samples fall. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Turns the Loudness samples of the silence step and the voice step into a Calibration. */
export function calibrate(silence: number[], voice: number[]): CalibrationResult {
  const noiseFloorDb = loudnessToDb(percentile(silence, 0.9));
  const fullVoiceDb = loudnessToDb(percentile(voice, 0.9));
  if (fullVoiceDb - noiseFloorDb < MIN_VOICE_SPAN_DB) return { ok: false, reason: "tooClose" };
  return { ok: true, calibration: { noiseFloorDb, fullVoiceDb } };
}

/** How far one step of Sensitivity moves the calibrated range, in dB. */
const SENSITIVITY_STEP_DB = 3;
/** The narrowest the calibrated range gets, in dB. */
const MIN_RANGE_DB = 3;

/**
 * The Thrust range a Calibration gives at a Sensitivity. The default Sensitivity uses the
 * Calibration as measured; each step above moves the range down (a quieter voice is enough),
 * each step below moves it up. The bottom never drops below the Noise Floor plus margin.
 */
export function calibratedRange(cal: Calibration, sensitivity: number): ThrustRange {
  const s = Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, sensitivity));
  const shift = (s - SENSITIVITY_DEFAULT) * SENSITIVITY_STEP_DB;
  const lowest = cal.noiseFloorDb + NOISE_MARGIN_DB;
  const floorDb = Math.max(lowest, lowest - shift);
  const fullDb = Math.max(floorDb + MIN_RANGE_DB, cal.fullVoiceDb - shift);
  return { floorDb, fullDb };
}
