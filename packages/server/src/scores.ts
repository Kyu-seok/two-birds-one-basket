import type { StoredRun, TeamInfo, TopRun } from "@tbob/shared";

/** The Browser IDs of the two players in a Room, in either order. */
export type Pair = readonly [string, string];

/**
 * Where finished Runs and Teams are kept. A Team is a named pair of browsers; a pair's Runs are
 * kept whether or not they have named their Team yet, so naming it later adopts the Runs before.
 * SQLite in production (`scores-sqlite.ts`), `MemoryScores` in tests.
 */
export interface ScoreStore {
  /** The Team made of exactly these two browsers, or null if they haven't named one. */
  teamOf(pair: Pair): TeamInfo | null;
  /** Names a new Team for the pair. A pair that already has a Team keeps it (and its name). */
  nameTeam(pair: Pair, name: string): TeamInfo;
  /** Stores a finished Run. `pair` is null when a player had no Browser ID; such Runs belong to no Team. */
  saveRun(pair: Pair | null, run: StoredRun): void;
  /** The pair's finished Runs, oldest first: its Team History. Empty means their next Run is their first. */
  history(pair: Pair): StoredRun[];
  /** The ten longest Distances across all named Teams, longest first. */
  top10(): TopRun[];
}

/** The same key for a pair whichever way round its browsers come. */
export function pairKey([a, b]: Pair): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}
