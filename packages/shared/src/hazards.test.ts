import { describe, expect, it } from "vitest";
import { TICK_HZ } from "./messages.ts";
import { courseOf, type Course, type Span } from "./course.ts";
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

void PHYSICS;
