import { describe, expect, it } from "vitest";
import { rememberCalibration, savedCalibration } from "./saved-calibration.ts";
import { FakeStorage } from "./testing.ts";

describe("Calibration saved in the browser", () => {
  const CAL = { noiseFloorDb: -60, fullVoiceDb: -25 };

  it("comes back for the same Room, so reopening its link needn't calibrate again", () => {
    const storage = new FakeStorage();

    rememberCalibration(storage, "ABCDE", CAL);

    expect(savedCalibration(storage, "ABCDE")).toEqual(CAL);
  });

  it("is done again in another Room", () => {
    const storage = new FakeStorage();
    rememberCalibration(storage, "ABCDE", CAL);

    expect(savedCalibration(storage, "FGHJK")).toBeNull();
  });

  it("reads nothing from junk", () => {
    const storage = new FakeStorage();
    storage.setItem("tbob.calibration", JSON.stringify({ room: "ABCDE", noiseFloorDb: "loud" }));

    expect(savedCalibration(storage, "ABCDE")).toBeNull();
  });
});
