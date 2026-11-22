import { describe, expect, it } from "vitest";
import { followCamera } from "./camera.ts";

const FRAME = 1 / 60;

function follow(from: { x: number; y: number }, to: { x: number; y: number }, seconds: number) {
  let cam = from;
  for (let i = 0; i < Math.round(seconds / FRAME); i++) cam = followCamera(cam, to, FRAME);
  return cam;
}

describe("the shared camera", () => {
  it("eases towards the point between the Birds rather than jumping there", () => {
    const cam = followCamera({ x: 0, y: 0 }, { x: 2, y: 1 }, FRAME);
    expect(cam.x).toBeGreaterThan(0);
    expect(cam.x).toBeLessThan(0.5);
    expect(cam.y).toBeLessThan(0.25);
  });

  it("catches up within about a second", () => {
    const cam = follow({ x: 0, y: 0 }, { x: 2, y: 1 }, 1);
    expect(cam.x).toBeCloseTo(2, 1);
    expect(cam.y).toBeCloseTo(1, 1);
  });

  it("cuts straight to the Birds when they are far away, as at the start of a new Run", () => {
    expect(followCamera({ x: 120, y: 0 }, { x: 0.75, y: 0 }, FRAME)).toEqual({ x: 0.75, y: 0 });
  });
});
