import { describe, expect, it } from "vitest";
import { calibrate, calibratedRange, loudnessToThrust, SENSITIVITY_DEFAULT, SENSITIVITY_MAX } from "./loudness.ts";

/** Loudness (RMS) that reads as the given dBFS. */
const db = (d: number) => 10 ** (d / 20);
const samples = (d: number, n = 60) => Array.from({ length: n }, () => db(d));

describe("Calibration", () => {
  it("gives 0 Thrust up to the Noise Floor plus margin, 1 at Full Voice, scaled in dB between", () => {
    const result = calibrate(samples(-60), samples(-30));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const range = calibratedRange(result.calibration, SENSITIVITY_DEFAULT);

    expect(loudnessToThrust(db(-60), range)).toBe(0);
    // The 5 dB margin: room noise a little louder than measured still gives nothing.
    expect(loudnessToThrust(db(-55), range)).toBe(0);
    expect(loudnessToThrust(db(-42.5), range)).toBeCloseTo(0.5);
    expect(loudnessToThrust(db(-30), range)).toBe(1);
    expect(loudnessToThrust(db(-20), range)).toBe(1);
  });

  it("takes Full Voice from a high percentile of the voice step, so one cough does not set it", () => {
    const voice = [...samples(-50, 9), ...samples(-30, 50), db(-5)];
    const result = calibrate(samples(-60), voice);
    expect(result.ok && result.calibration.fullVoiceDb).toBeCloseTo(-30);
  });

  it("asks for a retry when the voice step is under 10 dB above the Noise Floor", () => {
    expect(calibrate(samples(-50), samples(-41))).toEqual({ ok: false, reason: "tooClose" });
    expect(calibrate(samples(-50), samples(-39)).ok).toBe(true);
  });

  it("lets Sensitivity move the calibrated range, without room noise ever giving Thrust", () => {
    const result = calibrate(samples(-60), samples(-30));
    if (!result.ok) throw new Error("calibration failed");
    const cal = result.calibration;

    // More sensitive: a quieter voice reaches full Thrust, but the Noise Floor margin stays.
    const keen = calibratedRange(cal, SENSITIVITY_DEFAULT + 2);
    expect(loudnessToThrust(db(-36), keen)).toBe(1);
    expect(loudnessToThrust(db(-37), keen)).toBeLessThan(1);
    expect(loudnessToThrust(db(-55), keen)).toBe(0);

    // Less sensitive: the whole range moves up.
    const firm = calibratedRange(cal, SENSITIVITY_DEFAULT - 2);
    expect(loudnessToThrust(db(-30), firm)).toBeLessThan(1);
    expect(loudnessToThrust(db(-24), firm)).toBe(1);
    expect(loudnessToThrust(db(-49), firm)).toBe(0);

    // Even at the top Sensitivity on a narrow Calibration, room noise gives nothing.
    const narrow = calibrate(samples(-50), samples(-40));
    if (!narrow.ok) throw new Error("calibration failed");
    const top = calibratedRange(narrow.calibration, SENSITIVITY_MAX);
    expect(loudnessToThrust(db(-45), top)).toBe(0);
    expect(loudnessToThrust(db(-40), top)).toBe(1);
  });
});
