import { describe, expect, it } from "vitest";
import { TICK_HZ } from "./messages.ts";
import { courseOf, fixedCourse, type Course, type Span } from "./course.ts";
import { PHYSICS, initialWorld, stepWorld, type Thrusts, type WorldState } from "./physics.ts";

const TICK = 1 / TICK_HZ;
const SILENT: Thrusts = { pink: 0, blue: 0 };

function run(world: WorldState, thrust: Thrusts, seconds: number, course: Course): WorldState {
  let w = world;
  for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) w = stepWorld(w, thrust, TICK, course);
  return w;
}

/** Both Birds standing at `pinkX`, `blueX` on ground at `y`. */
function standing(pinkX: number, blueX: number, y = 0): WorldState {
  const w = initialWorld();
  const at = (x: number) => ({ ...w.birds.pink, x, y });
  return { ...w, birds: { pink: at(pinkX), blue: at(blueX) } };
}

describe("the Run's clock", () => {
  it("starts at zero and advances with every tick, so timed hazards follow it", () => {
    expect(initialWorld().time).toBe(0);
    const course = courseOf([{ from: -10, to: 10, height: 0 }]);
    expect(run(initialWorld(), SILENT, 2, course).time).toBeCloseTo(2, 6);
  });
});

describe("a moving platform", () => {
  // Ground to 2 m, then a platform from 3 to 5 m that slides 4 m forward and back every 8 s, then ground from 10 m.
  const platform: Span = { from: 3, to: 5, height: 0, move: { dx: 4, period: 8 } };
  const course = courseOf([{ from: -10, to: 2, height: 0 }, platform, { from: 10, to: 20, height: 0 }]);

  it("carries a Bird standing on it", () => {
    const w = standing(4, 4.5);
    const half = run(w, SILENT, 4, course);
    expect(half.birds.pink.x).toBeCloseTo(8, 1);
    expect(half.birds.blue.x).toBeCloseTo(8.5, 1);
    expect(half.birds.pink.grounded).toBe(true);
    const back = run(half, SILENT, 4, course);
    expect(back.birds.pink.x).toBeCloseTo(4, 1);
  });

  it("is in the same place for the same Run time, whoever is looking", () => {
    const a = run(standing(-5, -4), SILENT, 3, course);
    const b = run(standing(-8, -7), { pink: 0.3, blue: 0.3 }, 3, course);
    expect(a.time).toBe(b.time);
  });
});

describe("a crumbling platform", () => {
  // Ground to 5 m, a crumbling platform from 6 to 8 m (holds 1 s, gone 2 s), ground from 9 m.
  const course = courseOf([
    { from: -10, to: 5, height: 0 },
    { from: 6, to: 8, height: 0, crumble: { holdSeconds: 1, goneSeconds: 2 } },
    { from: 9, to: 20, height: 0 },
  ]);

  it("holds a Bird that stands on it for a while", () => {
    const w = run(standing(4, 7), SILENT, 0.9, course);
    expect(w.birds.blue).toMatchObject({ x: 7, y: 0, grounded: true });
  });

  it("then gives way, and the Bird on it drops and hangs from its partner; it does not kill", () => {
    const w = run(standing(4, 7), SILENT, 2, course);
    expect(w.birds.blue.y).toBeLessThan(0);
    expect(w.fallen).toBe(false);
  });

  it("drops both Birds if both stay on it, ending the Run as Fallen", () => {
    const w = run(standing(6.5, 7.5), SILENT, 3, course);
    expect(w.fallen).toBe(true);
  });

  it("starts crumbling when a Bird first stands on it, not when the Run starts", () => {
    const waited = run(standing(3, 4), SILENT, 5, course);
    const onIt = { ...waited, birds: { ...waited.birds, blue: { ...waited.birds.blue, x: 7 } } };
    expect(run(onIt, SILENT, 0.9, course).birds.blue.grounded).toBe(true);
    expect(run(onIt, SILENT, 2, course).birds.blue.y).toBeLessThan(0);
  });

  it("comes back after a while", () => {
    // Blue drops, is hauled back up by Pink, and the platform is there again later.
    const w = run(standing(4, 7), SILENT, 1.5, course);
    const later = run(w, SILENT, 3, course);
    const blueBack = { ...later, birds: { pink: later.birds.pink, blue: { ...later.birds.pink, x: 7 } } };
    expect(run(blueBack, SILENT, 0.5, course).birds.blue).toMatchObject({ x: 7, y: 0, grounded: true });
  });
});

describe("a gust", () => {
  // Flat ground with a headwind over 0..10 m blowing for the first 2 s of every 5 s.
  const course: Course = fixedCourse([
    {
      x: -20,
      piece: {
        name: "windy",
        tier: "hard",
        length: 60,
        ground: [{ from: 0, to: 60, height: 0 }],
        ceilings: [],
        gusts: [{ from: 20, to: 30, push: -2, period: 5, on: 2 }],
      },
    },
  ]);

  it("pushes a Bird back while it blows", () => {
    const w = run(standing(4, 5), SILENT, 1, course);
    expect(w.birds.pink.x).toBeCloseTo(2, 1);
    expect(w.birds.pink.grounded).toBe(true);
  });

  it("comes in bursts: between them, the air is still", () => {
    const calm = run(standing(4, 5), SILENT, 2, course);
    const still = run(calm, SILENT, 2.5, course);
    expect(still.birds.pink.x).toBeCloseTo(calm.birds.pink.x, 6);
  });

  it("shortens a jump made into it", () => {
    const into = run(standing(4, 5), { pink: 1, blue: 0 }, 0.5, course).birds.pink.x;
    const waited = run(standing(4, 5), SILENT, 2.2, course);
    const calm = run(waited, { pink: 1, blue: 0 }, 0.5, course).birds.pink.x;
    expect(into - 4).toBeLessThan(calm - waited.birds.pink.x - 0.5);
  });
});

describe("swinging on the Rope", () => {
  // A plateau 2.4 m up ending at 10 m, a 3 m gap, and ground from 13 m: too wide to jump.
  const course = courseOf([
    { from: -10, to: 10, height: 2.4 },
    { from: 13, to: 30, height: 0 },
  ]);

  /** Pink anchors at the lip; Blue has dropped off it and hangs against the wall. */
  function blueHanging(): WorldState {
    const off = run(standing(10, 10, 2.4), { pink: 0, blue: 0.3 }, 0.3, course);
    return run(off, SILENT, 2, course);
  }

  it("a Bird hanging silent stays against the wall below its partner", () => {
    const w = blueHanging();
    expect(w.birds.blue.y).toBeLessThan(0);
    expect(w.birds.blue.x).toBeCloseTo(10, 1);
    expect(w.fallen).toBe(false);
  });

  it("a jump-level voice swings it out across the gap, where it catches the far ledge", () => {
    const w = run(blueHanging(), { pink: 0, blue: 0.7 }, 3, course);
    expect(w.birds.blue).toMatchObject({ y: 0, grounded: true });
    expect(w.birds.blue.x).toBeGreaterThanOrEqual(13);
  });

  it("a walking-level voice still climbs back up to its partner instead", () => {
    const w = run(blueHanging(), { pink: 0, blue: 0.4 }, 6, course);
    expect(w.birds.blue).toMatchObject({ y: 2.4, grounded: true });
    expect(w.birds.blue.x).toBeLessThanOrEqual(10);
  });
});
