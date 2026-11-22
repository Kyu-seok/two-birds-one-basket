import { browserId, type Calibration, type TeamInfo } from "@tbob/shared";

/** The part of `localStorage` this needs, so tests can pass a fake. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const BROWSER_KEY = "tbob.browserId";
const TEAMS_KEY = "tbob.teams";
const CALIBRATION_KEY = "tbob.calibration";

function read(storage: KeyValueStore, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: KeyValueStore, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage blocked (private mode, site data off): it lasts only for this page.
  }
}

function newId(): string {
  // randomUUID needs a secure context; a page opened over plain http on the LAN isn't one.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * This browser's Browser ID, made on first use and kept in storage. Sent with every join so the
 * server recognises this browser: its Teams across Rooms, and (#12) its Bird when it reconnects.
 */
export function loadBrowserId(storage: KeyValueStore): string {
  const stored = browserId(read(storage, BROWSER_KEY));
  if (stored) return stored;
  const id = newId();
  write(storage, BROWSER_KEY, id);
  return id;
}

/** The Teams this browser belongs to, as the server named them. */
export function savedTeams(storage: KeyValueStore): TeamInfo[] {
  try {
    const list: unknown = JSON.parse(read(storage, TEAMS_KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (t): t is TeamInfo => typeof t?.id === "string" && typeof t?.name === "string",
    );
  } catch {
    return [];
  }
}

/** Saves a Team's ID (and name) in this browser. */
export function rememberTeam(storage: KeyValueStore, team: TeamInfo) {
  const saved = savedTeams(storage);
  const entry = { id: team.id, name: team.name };
  const teams = saved.some((t) => t.id === team.id)
    ? saved.map((t) => (t.id === team.id ? entry : t))
    : [...saved, entry];
  write(storage, TEAMS_KEY, JSON.stringify(teams));
}

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
