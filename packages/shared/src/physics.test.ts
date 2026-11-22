import { describe, expect, it } from "vitest";
import { TICK_HZ } from "./messages.ts";
import { initialBasket, stepBasket, type BasketState } from "./physics.ts";

const TICK = 1 / TICK_HZ;

function run(state: BasketState, left: number, right: number, seconds: number): BasketState {
  let s = state;
  for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) s = stepBasket(s, { left, right }, TICK);
  return s;
}

describe("stepBasket", () => {
  it("rises straight up when both Sides give equal Thrust", () => {
    const start = initialBasket();
    const end = run(start, 1, 1, 2);
    expect(end.y).toBeGreaterThan(start.y + 1);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.angle).toBeCloseTo(0, 6);
  });

  it("tilts and drifts right when the Left Side is louder", () => {
    const end = run(initialBasket(), 1, 0.5, 2);
    expect(end.angle).toBeGreaterThan(0);
    expect(end.x).toBeGreaterThan(0.5);
  });

  it("tilts and drifts left when the Right Side is louder", () => {
    const end = run(initialBasket(), 0.5, 1, 2);
    expect(end.angle).toBeLessThan(0);
    expect(end.x).toBeLessThan(-0.5);
  });

  it("sinks under gravity when both Sides are silent", () => {
    const start = { ...initialBasket(), y: 20 };
    const end = run(start, 0, 0, 1);
    expect(end.y).toBeLessThan(start.y - 1);
  });

  it("comes to rest on the ground instead of falling through it", () => {
    const end = run({ ...initialBasket(), y: 5 }, 0, 0, 5);
    expect(end.y).toBe(0);
    expect(end.vy).toBe(0);
  });
});
