import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredRun } from "@tbob/shared";
import type { ScoreStore } from "./scores.ts";
import { openSqliteScores } from "./scores-sqlite.ts";
import { MemoryScores } from "./testing.ts";

const run = (distance: number, endedAt = 1000): StoredRun => ({ distance, end: "fallen", seconds: 12.5, endedAt });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "tbob-scores-"));
  dirs.push(dir);
  return join(dir, "scores.db");
}

// The in-memory fake the Room tests use must behave like the real SQLite store.
describe.each([
  ["in memory", () => new MemoryScores() as ScoreStore],
  ["SQLite", () => openSqliteScores(tempDb())],
])("ScoreStore (%s)", (_, open) => {
  it("knows no Team for a pair until they name one, then the same Team whichever way round", () => {
    const scores = open();
    expect(scores.teamOf(["aaaaaaaa", "bbbbbbbb"])).toBeNull();

    const team = scores.nameTeam(["aaaaaaaa", "bbbbbbbb"], "Sky Pals");

    expect(team.name).toBe("Sky Pals");
    expect(scores.teamOf(["bbbbbbbb", "aaaaaaaa"])).toEqual(team);
  });

  it("keeps a pair's existing Team when asked to name it again", () => {
    const scores = open();
    const first = scores.nameTeam(["aaaaaaaa", "bbbbbbbb"], "First");

    expect(scores.nameTeam(["bbbbbbbb", "aaaaaaaa"], "Second")).toEqual(first);
  });

  it("gives a browser with a different partner a separate Team", () => {
    const scores = open();
    const ab = scores.nameTeam(["aaaaaaaa", "bbbbbbbb"], "AB");

    expect(scores.teamOf(["aaaaaaaa", "cccccccc"])).toBeNull();
    const ac = scores.nameTeam(["aaaaaaaa", "cccccccc"], "AC");
    expect(ac.id).not.toBe(ab.id);
    expect(scores.teamOf(["aaaaaaaa", "bbbbbbbb"])).toEqual(ab);
  });

  it("keeps a pair's Runs, oldest first, including those from before they named their Team", () => {
    const scores = open();
    scores.saveRun(["aaaaaaaa", "bbbbbbbb"], run(4, 1));
    scores.nameTeam(["aaaaaaaa", "bbbbbbbb"], "AB");
    scores.saveRun(["bbbbbbbb", "aaaaaaaa"], run(9, 2));
    scores.saveRun(["aaaaaaaa", "cccccccc"], run(30, 3));

    expect(scores.history(["aaaaaaaa", "bbbbbbbb"])).toEqual([run(4, 1), run(9, 2)]);
    expect(scores.history(["dddddddd", "bbbbbbbb"])).toEqual([]);
  });

  it("keeps separate histories for two pairs with the same team name", () => {
    const scores = open();
    scores.nameTeam(["aaaaaaaa", "bbbbbbbb"], "Twins");
    scores.nameTeam(["cccccccc", "dddddddd"], "Twins");
    scores.saveRun(["aaaaaaaa", "bbbbbbbb"], run(5));
    scores.saveRun(["cccccccc", "dddddddd"], run(7));

    expect(scores.history(["aaaaaaaa", "bbbbbbbb"])).toEqual([run(5)]);
    expect(scores.history(["cccccccc", "dddddddd"])).toEqual([run(7)]);
  });

  it("lists the ten longest Distances across all named Teams, longest first", () => {
    const scores = open();
    const ab = scores.nameTeam(["aaaaaaaa", "bbbbbbbb"], "AB");
    const cd = scores.nameTeam(["cccccccc", "dddddddd"], "CD");
    for (let i = 1; i <= 8; i++) scores.saveRun(["aaaaaaaa", "bbbbbbbb"], run(i, i));
    for (let i = 1; i <= 4; i++) scores.saveRun(["cccccccc", "dddddddd"], run(i + 0.5, 100 + i));
    // A pair without a Team isn't on the Top 10, nor is a Run with no pair.
    scores.saveRun(["eeeeeeee", "ffffffff"], run(99));
    scores.saveRun(null, run(98));

    const top = scores.top10();

    expect(top.map((r) => [r.distance, r.team.name])).toEqual([
      [8, "AB"], [7, "AB"], [6, "AB"], [5, "AB"], [4.5, "CD"],
      [4, "AB"], [3.5, "CD"], [3, "AB"], [2.5, "CD"], [2, "AB"],
    ]);
    expect(top[0]).toEqual({ ...run(8, 8), team: ab });
    expect(top[4]!.team).toEqual(cd);
  });
});

describe("SQLite ScoreStore", () => {
  it("keeps Teams and Runs across a server restart", () => {
    const path = tempDb();
    const before = openSqliteScores(path);
    const team = before.nameTeam(["aaaaaaaa", "bbbbbbbb"], "AB");
    before.saveRun(["aaaaaaaa", "bbbbbbbb"], run(6.25, 42));
    before.close();

    const after = openSqliteScores(path);

    expect(after.teamOf(["bbbbbbbb", "aaaaaaaa"])).toEqual(team);
    expect(after.history(["aaaaaaaa", "bbbbbbbb"])).toEqual([run(6.25, 42)]);
    expect(after.top10()).toEqual([{ ...run(6.25, 42), team }]);
    after.close();
  });
});
