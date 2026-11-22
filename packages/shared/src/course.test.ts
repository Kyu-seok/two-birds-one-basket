import { describe, expect, it } from "vitest";
import { PIECES, TIERS, randomCourse, tierWeights, type Piece, type Tier } from "./course.ts";

describe("a random Course", () => {
  it("is the same for the same seed, so the server and both clients build the same one", () => {
    const a = randomCourse(42).piecesBetween(0, 300);
    const b = randomCourse(42).piecesBetween(0, 300);
    expect(a).toEqual(b);
  });

  it("is different for a different seed", () => {
    const names = (seed: number) => randomCourse(seed).piecesBetween(0, 300).map((p) => p.piece.name);
    expect(names(1)).not.toEqual(names(2));
  });

  it("extends as far as the Birds go, with each Piece starting where the last ended", () => {
    const placed = randomCourse(7).piecesBetween(0, 2000);
    expect(placed.at(-1)!.x + placed.at(-1)!.piece.length).toBeGreaterThanOrEqual(2000);
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i]!.x).toBeCloseTo(placed[i - 1]!.x + placed[i - 1]!.piece.length, 9);
    }
  });

  it("starts with flat ground under the Birds' start", () => {
    const [first] = randomCourse(3).piecesBetween(-5, 5);
    expect(first!.x).toBeLessThan(-5);
    expect(first!.piece.ground).toEqual([{ from: 0, to: first!.piece.length, height: 0 }]);
  });

  it("only places Pieces of Tiers that have Pieces, falling back to an easier Tier", () => {
    const easyOnly = PIECES.filter((p) => p.tier === "easy");
    const tiers = randomCourse(5, easyOnly).piecesBetween(0, 3000).map((p) => p.piece.tier);
    expect(new Set(tiers)).toEqual(new Set(["easy"]));
  });

  it("places harder Pieces further along when the catalog has them", () => {
    const piece = (tier: Tier): Piece => ({ name: tier, tier, length: 10, ground: [{ from: 0, to: 10, height: 0 }], ceilings: [] });
    const course = randomCourse(9, TIERS.map(piece));
    const tiersBetween = (from: number, to: number) =>
      course.piecesBetween(from, to).filter((p) => p.x >= from).map((p) => p.piece.tier);
    const early = tiersBetween(0, 30);
    const late = tiersBetween(2000, 3000);
    expect(early.every((t) => t === "easy")).toBe(true);
    expect(late.filter((t) => t !== "easy").length).toBeGreaterThan(late.length / 2);
  });
});

describe("Tier weighting", () => {
  it("is all Easy at the start", () => {
    expect(tierWeights(0)).toEqual({ easy: 1, medium: 0, hard: 0 });
  });

  it("shifts towards harder Tiers as Distance grows", () => {
    const distances = [0, 50, 100, 200, 400, 800, 1600];
    const w = distances.map(tierWeights);
    for (let i = 1; i < w.length; i++) {
      expect(w[i]!.easy).toBeLessThanOrEqual(w[i - 1]!.easy);
      expect(w[i]!.hard).toBeGreaterThanOrEqual(w[i - 1]!.hard);
    }
    expect(w.at(-1)!.easy).toBeLessThan(0.3);
    expect(w.at(-1)!.hard).toBeGreaterThan(w.at(-1)!.easy);
  });

  it("always adds up to one", () => {
    for (const d of [0, 75, 333, 5000]) {
      const { easy, medium, hard } = tierWeights(d);
      expect(easy + medium + hard).toBeCloseTo(1, 9);
    }
  });
});

describe("the Easy Pieces", () => {
  const easy = PIECES.filter((p) => p.tier === "easy");
  const named = (name: string) => easy.find((p) => p.name === name);

  it("include flat walk, small gaps, steps and a low ceiling", () => {
    for (const name of ["flat walk", "small gap", "steps", "low ceiling"]) expect(named(name), name).toBeDefined();
  });

  it("each start and end on ground at height 0, so any Piece can follow any other", () => {
    for (const p of PIECES) {
      const first = p.ground[0]!;
      const last = p.ground.at(-1)!;
      expect(first).toMatchObject({ from: 0, height: 0 });
      expect(last).toMatchObject({ to: p.length, height: 0 });
    }
  });
});
