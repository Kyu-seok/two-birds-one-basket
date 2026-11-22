import { describe, expect, it } from "vitest";
import { runEndText } from "./run.ts";

const course = { seed: 1, opening: false, distance: 3, ready: { pink: false, blue: false } };

describe("the Run End text", () => {
  it("tells the player who left that they left, and their partner that the partner did", () => {
    const run = { phase: "ended", end: "abandoned", dropped: "blue", ...course } as const;
    expect(runEndText(run, "blue")).toMatch(/^Abandoned: you left/);
    expect(runEndText(run, "pink")).toMatch(/^Abandoned: your partner left/);
  });

  it("is the same for both players when the Run is Fallen", () => {
    const run = { phase: "ended", end: "fallen", ...course } as const;
    expect(runEndText(run, "pink")).toBe(runEndText(run, "blue"));
    expect(runEndText(run, "pink")).toMatch(/^Fallen/);
  });
});
