import { browserId, type TeamInfo } from "@tbob/shared";
import { read, write, type KeyValueStore } from "./storage.ts";

const BROWSER_KEY = "tbob.browserId";
const TEAMS_KEY = "tbob.teams";

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
