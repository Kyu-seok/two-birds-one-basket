/**
 * Whole-Room stories: two players' browsers through calibrating, Runs, Teams, dropping and coming
 * back, told as each player sees them. Each feature has its own tests; these check where they meet.
 */
import { describe, expect, it } from "vitest";
import { COUNTDOWN_SECONDS, RECONNECT_SECONDS, TICK_HZ, type RunState } from "@tbob/shared";
import { runEndText } from "../../client/src/run.ts";
import type { RoomRegistry } from "./rooms.ts";
import { FakeConnection, TEST_OPENING_LENGTH, courseWithOpening, setup } from "./testing.ts";

const ANN = "browser-ann";
const BO = "browser-bo";
const CY = "browser-cy";

/** One player's browser tab in a Room: what it sends, and what it has been shown. */
function openTab(rooms: RoomRegistry, code: string, browser: string) {
  const conn = new FakeConnection();
  const player = rooms.connect(code, conn, browser);
  const tab = {
    conn,
    player,
    get bird() {
      return conn.last("joined")!.bird;
    },
    get state() {
      return conn.last("state")!;
    },
    get run(): RunState {
      return conn.last("state")!.run;
    },
    get scores() {
      return conn.last("scores")!;
    },
    /** The Run End line this player's screen shows. */
    get runEnd() {
      const run = tab.run;
      return run.phase === "ended" ? runEndText(run, tab.bird) : null;
    },
    calibrate() {
      player!.receive({ type: "calibrated", value: true });
    },
    /** Ready before the first Run; Again on the Run End screen. */
    ready() {
      player!.receive({ type: "ready", value: true });
    },
    thrust(value: number) {
      player!.receive({ type: "thrust", value });
    },
  };
  return tab;
}
type Tab = ReturnType<typeof openTab>;

const seconds = (s: number) => s * TICK_HZ;

/** Both press Ready (or Again) and the countdown runs out. */
function startRun(scheduler: { fire(n?: number): void }, ...tabs: Tab[]) {
  for (const t of tabs) t.ready();
  scheduler.fire(seconds(COUNTDOWN_SECONDS));
}

/** Both walk into the gap at 8 m and fall. */
function walkIntoTheGap(scheduler: { fire(n?: number): void }, ...tabs: Tab[]) {
  for (const t of tabs) t.thrust(0.4);
  scheduler.fire(seconds(10));
  for (const t of tabs) t.thrust(0);
}

const distance = (run: RunState) => ("distance" in run ? run.distance : NaN);

describe("a new pair's first Room", () => {
  it("calibrate, Ready, count down into the Opening, fall, see a Distance past the Opening, name a Team, and go Again", () => {
    const { rooms, scheduler, scores } = setup({ courseOf: courseWithOpening, now: () => 1_000 });
    const code = rooms.createRoom();
    const ann = openTab(rooms, code, ANN);
    const bo = openTab(rooms, code, BO);
    expect([ann.bird, bo.bird]).toEqual(["pink", "blue"]);

    // Ready only counts once a player has calibrated.
    ann.ready();
    scheduler.fire();
    expect(bo.run).toEqual({ phase: "waiting", ready: { pink: false, blue: false } });

    ann.calibrate();
    bo.calibrate();
    ann.ready();
    bo.ready();
    scheduler.fire();
    // A pair with no Team starts with the Opening.
    for (const t of [ann, bo]) expect(t.run).toMatchObject({ phase: "countdown", course: { opening: true } });

    scheduler.fire(seconds(COUNTDOWN_SECONDS));
    for (const t of [ann, bo]) expect(t.run).toMatchObject({ phase: "running", distance: 0 });

    walkIntoTheGap(scheduler, ann, bo);
    for (const t of [ann, bo]) {
      expect(t.run).toMatchObject({ phase: "ended", end: "fallen" });
      expect(t.runEnd).toMatch(/^Fallen/);
    }
    // The Birds fell at the gap from 8 m; the Opening's first 5 m don't count.
    const fell = distance(ann.run);
    expect(fell).toBeGreaterThan(8 - TEST_OPENING_LENGTH);
    expect(fell).toBeLessThan(9.8 - TEST_OPENING_LENGTH);
    expect(scores.history([ANN, BO])).toEqual([expect.objectContaining({ distance: fell, end: "fallen", endedAt: 1_000 })]);

    // They name their Team on the Run End screen; the Run they just played is theirs.
    expect(bo.scores).toMatchObject({ team: null, canNameTeam: true });
    bo.player!.receive({ type: "nameTeam", name: "Sky Pals" });
    for (const t of [ann, bo]) {
      expect(t.scores).toMatchObject({ team: { name: "Sky Pals" }, canNameTeam: false });
      expect(t.scores.history.map((r) => r.distance)).toEqual([fell]);
      expect(t.scores.top10).toEqual([expect.objectContaining({ distance: fell, team: t.scores.team })]);
    }

    // Again: a known Team that has finished a Run skips the Opening, and Calibration has lasted.
    ann.ready();
    bo.ready();
    scheduler.fire();
    expect(ann.state.calibrated).toEqual({ pink: true, blue: true });
    expect(ann.run).toMatchObject({ phase: "countdown", course: { opening: false } });
    scheduler.fire(seconds(COUNTDOWN_SECONDS));
    expect(bo.run).toMatchObject({ phase: "running", distance: 0 });
  });
});

describe("a known Team in a later Room", () => {
  it("skips the Opening, and its Team History and the Top 10 include the earlier Run", () => {
    const { rooms, scheduler } = setup({ courseOf: courseWithOpening });
    const first = rooms.createRoom();
    const ann = openTab(rooms, first, ANN);
    const bo = openTab(rooms, first, BO);
    for (const t of [ann, bo]) t.calibrate();
    startRun(scheduler, ann, bo);
    walkIntoTheGap(scheduler, ann, bo);
    ann.player!.receive({ type: "nameTeam", name: "Sky Pals" });
    const earlier = ann.scores.history[0]!;
    ann.player!.disconnect();
    bo.player!.disconnect();

    // Another day: Bo makes the Room this time, so Bo is pink.
    const later = rooms.createRoom();
    const bo2 = openTab(rooms, later, BO);
    const ann2 = openTab(rooms, later, ANN);
    expect([bo2.bird, ann2.bird]).toEqual(["pink", "blue"]);
    for (const t of [ann2, bo2]) {
      expect(t.scores).toMatchObject({ team: { name: "Sky Pals" }, canNameTeam: false });
      expect(t.scores.history).toEqual([earlier]);
      expect(t.scores.top10).toEqual([{ ...earlier, team: t.scores.team }]);
    }

    // Calibration is once per Room, so they calibrate again; then the Run skips the Opening.
    for (const t of [ann2, bo2]) t.calibrate();
    startRun(scheduler, ann2, bo2);
    expect(ann2.run).toMatchObject({ phase: "running", course: { opening: false } });

    walkIntoTheGap(scheduler, ann2, bo2);
    // Without the Opening the same fall counts the full 8 m and more.
    expect(distance(bo2.run)).toBeCloseTo(earlier.distance + TEST_OPENING_LENGTH, 5);
    expect(bo2.scores.history).toHaveLength(2);
    expect(bo2.scores.top10.map((r) => r.distance)).toEqual([distance(bo2.run), earlier.distance]);
  });
});

/** Ann (pink) and Bo (blue) calibrated, a Run under way, both walking for a second. */
function walkingRoom() {
  const { rooms, scheduler, scores } = setup();
  const code = rooms.createRoom();
  const ann = openTab(rooms, code, ANN);
  const bo = openTab(rooms, code, BO);
  for (const t of [ann, bo]) t.calibrate();
  startRun(scheduler, ann, bo);
  for (const t of [ann, bo]) t.thrust(0.4);
  scheduler.fire(seconds(1));
  return { rooms, scheduler, scores, code, ann, bo };
}

describe("a player dropping mid-Run and coming back", () => {
  it("pauses the Run for the partner, keeps the Bird from a stranger, and resumes with Calibration intact", () => {
    const { rooms, scheduler, scores, code, ann, bo } = walkingRoom();
    const before = distance(ann.run);
    expect(before).toBeGreaterThan(0);

    bo.player!.disconnect();
    scheduler.fire(seconds(10));
    expect(ann.run).toMatchObject({ phase: "paused", dropped: "blue", distance: before });
    expect(ann.state.present).toEqual({ pink: true, blue: false });

    // Someone else opening the link can't take Bo's Bird, so can't resume the Run either.
    const cy = openTab(rooms, code, CY);
    expect(cy.player).toBeNull();
    expect(cy.conn.messages).toEqual([{ type: "roomFull" }]);
    scheduler.fire();
    expect(ann.run.phase).toBe("paused");

    // Bo reopens the link 20 s later, inside the 30 s.
    scheduler.fire(seconds(10));
    const bo2 = openTab(rooms, code, BO);
    expect(bo2.bird).toBe("blue");
    bo2.thrust(0.4);
    scheduler.fire(seconds(1));

    for (const t of [ann, bo2]) {
      expect(t.state.calibrated).toEqual({ pink: true, blue: true });
      expect(t.run.phase).toBe("running");
    }
    expect(distance(ann.run)).toBeGreaterThan(before);
    expect(scores.runs).toEqual([]);
  });
});

describe("a player dropping mid-Run and not coming back", () => {
  it("keeps the Room open for them while it waits, then ends the Run as Abandoned, worded for each player", () => {
    const { rooms, scheduler, scores, code, ann, bo } = walkingRoom();
    const at = distance(ann.run);

    bo.player!.disconnect();
    // Ann reloads too while waiting: with both gone, the Room is still kept for them.
    scheduler.fire(seconds(5));
    ann.player!.disconnect();
    scheduler.fire(seconds(5));
    const ann2 = openTab(rooms, code, ANN);
    expect(ann2.bird).toBe("pink");
    scheduler.fire();
    expect(ann2.run).toMatchObject({ phase: "paused", dropped: "blue" });

    // Up to the last moment Bo's Bird is kept for Bo: the Room is found, but full for anyone else.
    scheduler.fire(seconds(RECONNECT_SECONDS - 12));
    expect(ann2.run.phase).toBe("paused");
    const cy = openTab(rooms, code, CY);
    expect(cy.conn.messages).toEqual([{ type: "roomFull" }]);

    scheduler.fire(seconds(2));
    expect(ann2.run).toMatchObject({ phase: "ended", end: "abandoned", dropped: "blue", distance: at });
    expect(ann2.runEnd).toBe("Abandoned: your partner left and didn't come back in time.");
    expect(scores.runs.map((r) => r.run)).toEqual([expect.objectContaining({ end: "abandoned", distance: at })]);

    // Bo opens the link too late: the Room is still there, and Bo's screen says it was Bo who left.
    const bo2 = openTab(rooms, code, BO);
    expect(bo2.bird).toBe("blue");
    scheduler.fire();
    expect(bo2.runEnd).toBe("Abandoned: you left and didn't come back in time.");
    // Together again, both see the Abandoned Run in their pair's Team History.
    for (const t of [ann2, bo2]) expect(t.scores.history).toEqual([expect.objectContaining({ end: "abandoned", distance: at })]);
    // Bo's Bird was freed with the Run, so Bo calibrates again before pressing Again.
    expect(bo2.state.calibrated).toEqual({ pink: true, blue: false });
  });
});

describe("a player alone in a Room", () => {
  it("keeps the Room when they reload while waiting, and the partner who arrives plays with them", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const ann = openTab(rooms, code, ANN);
    ann.calibrate();
    scheduler.fire(seconds(3));

    ann.player!.disconnect();
    scheduler.fire(seconds(2));
    const ann2 = openTab(rooms, code, ANN);
    expect(ann2.bird).toBe("pink");
    scheduler.fire();
    // The same Room, with Ann's Calibration, still waiting for a partner.
    expect(ann2.state.calibrated.pink).toBe(true);
    expect(ann2.state.present).toEqual({ pink: true, blue: false });
    expect(ann2.run).toEqual({ phase: "waiting", ready: { pink: false, blue: false } });

    const bo = openTab(rooms, code, BO);
    expect(bo.bird).toBe("blue");
    bo.calibrate();
    startRun(scheduler, ann2, bo);
    expect(ann2.run.phase).toBe("running");
  });
});
