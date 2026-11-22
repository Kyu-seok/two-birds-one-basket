import { describe, expect, it } from "vitest";
import { TICK_HZ } from "./messages.ts";
import { courseOf, randomCourse } from "./course.ts";
import { OPENING } from "./opening.ts";
import { initialWorld, type Thrusts, type WorldState } from "./physics.ts";
import { COUNTDOWN_SECONDS, distanceOf, newRoomRun, runCourse, setReady, stepRun, type RunState } from "./run.ts";

const TICK = 1 / TICK_HZ;
const SILENT: Thrusts = { pink: 0, blue: 0 };

/** Every Run here is on flat ground with one gap, from 8 m to 9.8 m. */
const TEST_COURSE = courseOf([
  { from: -100, to: 8, height: 0 },
  { from: 9.8, to: 200, height: 0 },
]);
const SEED = 7;

function tick(run: RunState, world: WorldState, thrust: Thrusts, seconds: number, seed = SEED, opening = false) {
  let s = { run, world };
  for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) {
    s = stepRun(s.run, s.world, thrust, TICK, () => ({ seed, opening }), () => TEST_COURSE);
  }
  return s;
}

function bothReady(run: RunState): RunState {
  return setReady(setReady(run, "pink", true), "blue", true);
}

/** A Run just started, both Birds at the start line. */
function started() {
  return tick(bothReady(newRoomRun()), initialWorld(), SILENT, COUNTDOWN_SECONDS);
}

describe("starting a Run", () => {
  it("waits for both players to be Ready", () => {
    const oneReady = setReady(newRoomRun(), "pink", true);
    const s = tick(oneReady, initialWorld(), { pink: 1, blue: 1 }, 5);

    expect(s.run).toEqual({ phase: "waiting", ready: { pink: true, blue: false } });
    expect(s.world).toEqual(initialWorld());
  });

  it("counts down 3-2-1 once both are Ready, with the Birds held at the start", () => {
    const s = tick(bothReady(newRoomRun()), initialWorld(), { pink: 0.4, blue: 0.4 }, 1.5);

    expect(s.run.phase).toBe("countdown");
    expect(s.run.phase === "countdown" && Math.ceil(s.run.secondsLeft)).toBe(2);
    expect(s.world).toEqual(initialWorld());
  });

  it("starts the Run when the countdown ends, and the Birds then move", () => {
    const s = started();
    expect(s.run).toEqual({ phase: "running", seed: SEED, opening: false, distance: 0 });

    const later = tick(s.run, s.world, { pink: 0.4, blue: 0.4 }, 1);
    expect(later.world.birds.pink.x).toBeGreaterThan(0.5);
  });

  it("a player can take back Ready before the countdown", () => {
    const run = setReady(setReady(newRoomRun(), "pink", true), "pink", false);
    expect(run).toEqual({ phase: "waiting", ready: { pink: false, blue: false } });
  });
});

describe("Distance", () => {
  it("is how far the Bird behind has got, in meters", () => {
    const w = initialWorld();
    const world = { ...w, birds: { pink: { ...w.birds.pink, x: 6.5 }, blue: { ...w.birds.blue, x: 4.2 } } };
    expect(distanceOf(world)).toBe(4.2);
  });

  it("grows as the Birds walk, measured by the Bird behind", () => {
    const s = started();
    const behind = tick(s.run, s.world, { pink: 0.4, blue: 0 }, 0.5);

    // Only pink walks, so it is the Bird behind until it passes blue, standing at 1.5 m.
    expect(behind.world.birds.pink.x).toBeGreaterThan(0.5);
    expect(behind.world.birds.pink.x).toBeLessThan(1.5);
    expect(behind.run.phase === "running" && behind.run.distance).toBeCloseTo(behind.world.birds.pink.x);

    const past = tick(behind.run, behind.world, { pink: 0.4, blue: 0 }, 1.5);
    expect(past.world.birds.pink.x).toBeGreaterThan(2);
    expect(past.run.phase === "running" && past.run.distance).toBeCloseTo(1.5);
  });

  it("never goes back down when the Birds step backward or swing", () => {
    const s = started();
    const run: RunState = { phase: "running", seed: SEED, opening: false, distance: 5 };
    const later = tick(run, s.world, SILENT, 0.5);
    expect(later.run).toEqual({ phase: "running", seed: SEED, opening: false, distance: 5 });
  });
});

describe("Fallen", () => {
  it("one Bird hanging from the Rope does not end the Run", () => {
    // Blue walks into the gap at 8 m and hangs from pink, standing on the ground.
    const s = started();
    const near = { ...s.world, birds: { pink: { ...s.world.birds.pink, x: 6 }, blue: { ...s.world.birds.blue, x: 7.5 } } };
    const later = tick(s.run, near, { pink: 0, blue: 0.4 }, 3);

    expect(later.world.birds.blue.y).toBeLessThan(0);
    expect(later.run.phase).toBe("running");
  });

  it("both Birds dropping ends the Run as Fallen, keeping its Distance", () => {
    const s = started();
    const later = tick(s.run, s.world, { pink: 0.4, blue: 0.4 }, 10);

    expect(later.run).toMatchObject({ phase: "ended", end: "fallen", ready: { pink: false, blue: false } });
    const distance = later.run.phase === "ended" ? later.run.distance : 0;
    // The Bird behind got to the gap at 8 m.
    expect(distance).toBeGreaterThan(7.5);
    expect(distance).toBeLessThan(9.8);
  });

  it("the world stops on the Run End screen", () => {
    const s = started();
    const ended = tick(s.run, s.world, { pink: 0.4, blue: 0.4 }, 10);
    const later = tick(ended.run, ended.world, { pink: 1, blue: 1 }, 1);
    expect(later).toEqual(ended);
  });
});

describe("Again", () => {
  function fallen() {
    const s = started();
    return tick(s.run, s.world, { pink: 0.4, blue: 0.4 }, 10);
  }

  it("one player pressing Again does not start a new Run", () => {
    const s = fallen();
    const later = tick(setReady(s.run, "pink", true), s.world, SILENT, 2);
    expect(later.run).toMatchObject({ phase: "ended", ready: { pink: true, blue: false } });
  });

  it("both pressing Again counts down a new Run from the start with Distance 0", () => {
    const s = fallen();
    const counting = tick(bothReady(s.run), s.world, SILENT, 1);
    expect(counting.run.phase).toBe("countdown");
    expect(counting.world).toEqual(initialWorld());

    const running = tick(counting.run, counting.world, SILENT, COUNTDOWN_SECONDS);
    expect(running.run).toEqual({ phase: "running", seed: SEED, opening: false, distance: 0 });
  });

  it("Ready can't be pressed during a Run", () => {
    const { run } = started();
    expect(setReady(run, "pink", true)).toEqual(run);
  });
});

describe("the Course", () => {
  it("each Run gets a new one, picked as its countdown starts and kept to its Run End", () => {
    const first = tick(bothReady(newRoomRun()), initialWorld(), SILENT, 0.5, 11);
    expect(first.run).toMatchObject({ phase: "countdown", seed: 11 });

    const ended = tick(first.run, first.world, { pink: 0.4, blue: 0.4 }, 15, 12);
    expect(ended.run).toMatchObject({ phase: "ended", seed: 11 });

    const second = tick(bothReady(ended.run), ended.world, SILENT, 0.5, 13);
    expect(second.run).toMatchObject({ phase: "countdown", seed: 13 });
  });

  it("is the Run's seeded random Course, or just the start before the first Run", () => {
    const running: RunState = { phase: "running", seed: 5, opening: false, distance: 0 };
    expect(runCourse(running).piecesBetween(0, 200)).toEqual(randomCourse(5).piecesBetween(0, 200));
    expect(runCourse(newRoomRun()).piecesBetween(0, 200).map((p) => p.piece.name)).toEqual(["start"]);
  });

  it("starts with the Opening when the Room asks for it as the Run's countdown starts", () => {
    const first = tick(bothReady(newRoomRun()), initialWorld(), SILENT, 0.5, 11, true);
    expect(first.run).toMatchObject({ phase: "countdown", seed: 11, opening: true });
    expect(runCourse(first.run).piecesBetween(0, 1)[0]!.piece).toBe(OPENING);

    const ended = tick(first.run, first.world, { pink: 0.4, blue: 0.4 }, 15, 12, false);
    expect(ended.run).toMatchObject({ phase: "ended", opening: true });

    const second = tick(bothReady(ended.run), ended.world, SILENT, 0.5, 13, false);
    expect(second.run).toMatchObject({ phase: "countdown", seed: 13, opening: false });
    expect(runCourse(second.run).piecesBetween(0, 1)[0]!.piece).not.toBe(OPENING);
  });
});
