import { describe, expect, it } from "vitest";
import { TICK_HZ } from "./messages.ts";
import { initialRope, stepRope, type RopeState } from "./physics.ts";

const TICK = 1 / TICK_HZ;

function run(state: RopeState, left: number, right: number, seconds: number): RopeState {
  let s = state;
  for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) s = stepRope(s, { left, right }, TICK);
  return s;
}

describe("stepRope", () => {
  it("rises straight up when both Sides give equal Thrust", () => {
    const start = initialRope();
    const end = run(start, 1, 1, 2);
    expect(end.y).toBeGreaterThan(start.y + 1);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.angle).toBeCloseTo(0, 6);
  });

  it("tilts and drifts right when the Left Side is louder", () => {
    const end = run(initialRope(), 1, 0.5, 2);
    expect(end.angle).toBeGreaterThan(0);
    expect(end.x).toBeGreaterThan(0.5);
  });

  it("tilts and drifts left when the Right Side is louder", () => {
    const end = run(initialRope(), 0.5, 1, 2);
    expect(end.angle).toBeLessThan(0);
    expect(end.x).toBeLessThan(-0.5);
  });

  it("sinks under gravity when both Sides are silent", () => {
    const start = { ...initialRope(), y: 20 };
    const end = run(start, 0, 0, 1);
    expect(end.y).toBeLessThan(start.y - 1);
  });

  it("comes to rest on the ground instead of falling through it", () => {
    const end = run({ ...initialRope(), y: 5 }, 0, 0, 5);
    expect(end.y).toBe(0);
    expect(end.vy).toBe(0);
  });
});
