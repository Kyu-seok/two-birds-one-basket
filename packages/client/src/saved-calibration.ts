import type { Calibration } from "@tbob/shared";
import { read, write, type KeyValueStore } from "./storage.ts";

const CALIBRATION_KEY = "tbob.calibration";

/**
 * Keeps this browser's Calibration for the Room it was made in, so a player who drops and
 * reopens the link gets it back with their Bird. Only the latest Room's is kept.
 */
export function rememberCalibration(storage: KeyValueStore, roomCode: string, calibration: Calibration) {
  write(storage, CALIBRATION_KEY, JSON.stringify({ room: roomCode, ...calibration }));
}

/** The Calibration this browser made in `roomCode`, or null if it has none for that Room. */
export function savedCalibration(storage: KeyValueStore, roomCode: string): Calibration | null {
  try {
    const saved = JSON.parse(read(storage, CALIBRATION_KEY) ?? "null");
    const { room, noiseFloorDb, fullVoiceDb } = saved ?? {};
    if (room !== roomCode || !Number.isFinite(noiseFloorDb) || !Number.isFinite(fullVoiceDb)) return null;
    return { noiseFloorDb, fullVoiceDb };
  } catch {
    return null;
  }
}
