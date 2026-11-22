import { cleanText } from "./chat.ts";
import type { RunEndReason } from "./run.ts";

/** A finished Run as kept in a Team History. */
export interface StoredRun {
  /** The Run's Distance, in meters. */
  distance: number;
  end: RunEndReason;
  /** How long the Run lasted, from the end of the countdown to the Run End. Recorded, not scored. */
  seconds: number;
  /** When the Run ended, in ms since the epoch. */
  endedAt: number;
}

/** A Team as both players' browsers know it. The name is for show: only the ID identifies a Team. */
export interface TeamInfo {
  id: string;
  name: string;
}

/** One entry of the Top 10: a Run and the Team that ran it. */
export interface TopRun extends StoredRun {
  team: TeamInfo;
}

export const TEAM_NAME_MAX_LENGTH = 24;

/**
 * Cleans an untrusted team name: drops control characters, collapses whitespace and cuts it
 * to TEAM_NAME_MAX_LENGTH characters. Returns null when nothing is left.
 */
export function teamName(raw: unknown): string | null {
  return cleanText(raw, TEAM_NAME_MAX_LENGTH, (s) => s.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " "));
}
