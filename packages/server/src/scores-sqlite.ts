import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { RunEndReason, StoredRun, TeamInfo, TopRun } from "@tbob/shared";
import { pairKey, type Pair, type ScoreStore } from "./scores.ts";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS teams (
    id   TEXT PRIMARY KEY,
    pair TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    pair     TEXT,
    distance REAL NOT NULL,
    end      TEXT NOT NULL,
    seconds  REAL NOT NULL,
    ended_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS runs_by_pair ON runs (pair);
  CREATE INDEX IF NOT EXISTS runs_by_distance ON runs (distance DESC);
`;

interface RunRow {
  distance: number;
  end: string;
  seconds: number;
  ended_at: number;
}

const toRun = (r: RunRow): StoredRun => ({
  distance: r.distance,
  end: r.end as RunEndReason,
  seconds: r.seconds,
  endedAt: r.ended_at,
});

/** Opens (creating if needed) the SQLite file at `path`, or an in-memory database for ":memory:". */
export function openSqliteScores(path: string): ScoreStore & { close(): void } {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const teamByPair = db.prepare("SELECT id, name FROM teams WHERE pair = ?");
  const insertTeam = db.prepare("INSERT INTO teams (id, pair, name) VALUES (?, ?, ?) ON CONFLICT (pair) DO NOTHING");
  const insertRun = db.prepare("INSERT INTO runs (pair, distance, end, seconds, ended_at) VALUES (?, ?, ?, ?, ?)");
  const runsByPair = db.prepare("SELECT distance, end, seconds, ended_at FROM runs WHERE pair = ? ORDER BY id");
  const top = db.prepare(`
    SELECT runs.distance, runs.end, runs.seconds, runs.ended_at, teams.id AS team_id, teams.name AS team_name
    FROM runs JOIN teams ON teams.pair = runs.pair
    ORDER BY runs.distance DESC, runs.id
    LIMIT 10`);

  const teamOf = (pair: Pair) => (teamByPair.get(pairKey(pair)) as TeamInfo | undefined) ?? null;

  return {
    teamOf,
    nameTeam(pair, name) {
      insertTeam.run(randomUUID(), pairKey(pair), name);
      return teamOf(pair)!;
    },
    saveRun(pair, run) {
      insertRun.run(pair && pairKey(pair), run.distance, run.end, run.seconds, run.endedAt);
    },
    history(pair) {
      return (runsByPair.all(pairKey(pair)) as unknown as RunRow[]).map(toRun);
    },
    top10() {
      return (top.all() as unknown as (RunRow & { team_id: string; team_name: string })[]).map(
        (r): TopRun => ({ ...toRun(r), team: { id: r.team_id, name: r.team_name } }),
      );
    },
    close() {
      db.close();
    },
  };
}
