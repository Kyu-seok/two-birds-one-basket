import { describe, expect, it } from "vitest";
import { BIRDS, partnerOf } from "./bird.ts";
import { fixedCourse, courseForSeed, randomCourse } from "./course.ts";
import { TICK_HZ } from "./messages.ts";
import { OPENING, OPENING_HINTS } from "./opening.ts";
import { initialWorld, stepWorld, type Thrusts, type WorldState } from "./physics.ts";
import { loneBirdCrosses } from "./testing.ts";

const TICK = 1 / TICK_HZ;
/** The Opening on its own, followed by flat ground. */
const COURSE = fixedCourse([
  { x: -30, piece: OPENING },
  { x: OPENING.length - 30, piece: { name: "flat", tier: "easy", length: 100, ground: [{ from: 0, to: 100, height: 0 }], ceilings: [] } },
]);
const OPENING_END = OPENING.length - 30;

const WALK = 0.35;
/** Where each obstacle starts, in Course meters, and the Thrust a scripted pair jumps it with. */
const OBSTACLES = [
  { edge: 14, jump: 0.8 }, // the small gap
  { edge: 25, jump: 0.65 }, // the dip under the low roof: soft
  { edge: 34, jump: 1 }, // the gap to jump together
  { edge: 44, jump: 1 }, // the pit, jumped over
];

/**
 * Scripted players: each walks to the next obstacle and goes quiet at its edge; once both are
 * there, they jump it together.
 */
function scripted(w: WorldState): Thrusts {
  const next = (x: number) => OBSTACLES.find((o) => x < o.edge);
  const atEdge = (x: number) => {
    const o = next(x);
    return o !== undefined && x >= o.edge - 0.6;
  };
  const thrust: Thrusts = { pink: 0, blue: 0 };
  for (const bird of BIRDS) {
    const b = w.birds[bird];
    const p = w.birds[partnerOf(bird)];
    if (!b.grounded) continue;
    if (!atEdge(b.x)) thrust[bird] = WALK;
    else if (atEdge(p.x) && p.grounded && next(p.x) === next(b.x)) thrust[bird] = next(b.x)!.jump;
  }
  return thrust;
}

/** Seconds until `done` holds, or Infinity within `seconds`. */
function until(world: WorldState, players: (w: WorldState) => Thrusts, done: (w: WorldState) => boolean, seconds = 10) {
  let w = world;
  for (let i = 1; i <= seconds * TICK_HZ; i++) {
    w = stepWorld(w, players(w), TICK, COURSE);
    if (w.fallen) return Infinity;
    if (done(w)) return i / TICK_HZ;
  }
  return Infinity;
}

function play(world: WorldState, players: (w: WorldState) => Thrusts, seconds: number) {
  let w = world;
  let fallen = false;
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    w = stepWorld(w, players(w), TICK, COURSE);
    fallen ||= w.fallen;
  }
  return { world: w, fallen };
}

describe("the Opening", () => {
  it("starts a Course that has it, under the Birds' start, with the random Pieces after it", () => {
    const placed = courseForSeed(4, true).piecesBetween(-5, 200);
    expect(placed[0]!.piece).toBe(OPENING);
    expect(placed[0]!.x).toBeLessThan(-5);
    const openingEnd = placed[0]!.x + OPENING.length;
    // About 50 m of teaching past the start line.
    expect(openingEnd).toBeGreaterThan(40);
    expect(openingEnd).toBeLessThan(70);
    expect(placed[1]!.x).toBeCloseTo(openingEnd, 9);
    expect(placed.slice(1).every((p) => p.piece !== OPENING)).toBe(true);
  });

  it("is left out of a Course without it, which starts where the random Pieces begin", () => {
    const placed = courseForSeed(4, false).piecesBetween(-5, 200);
    expect(placed.every((p) => p.piece !== OPENING)).toBe(true);
    expect(placed[0]!.piece.name).toBe("start");
    expect(placed).toEqual(randomCourse(4).piecesBetween(-5, 200));
  });

  it("can be crossed by two players who walk, stop at edges and jump together", () => {
    const { world, fallen } = play(initialWorld(), scripted, 60);
    expect(fallen).toBe(false);
    expect(Math.min(world.birds.pink.x, world.birds.blue.x)).toBeGreaterThan(OPENING_END);
  });

  /** Both Birds standing side by side at `x`. */
  function standingAt(x: number): WorldState {
    const w = initialWorld();
    return { ...w, birds: { pink: { ...w.birds.pink, x }, blue: { ...w.birds.blue, x: x - 0.4 } } };
  }
  const silent: Thrusts = { pink: 0, blue: 0 };
  /** Pink jumps with `thrust` once, from `x`, and is quiet after; Blue stays quiet. */
  const once = (x: number, thrust: number) => (w: WorldState) => (w.birds.pink.grounded && w.birds.pink.x <= x + 0.01 ? { pink: thrust, blue: 0 } : silent);

  it("bonks a loud jump under the low roof down into the dip, whose floor catches it", () => {
    const loud = once(24.6, 1);
    const { world, fallen } = play(standingAt(24.6), loud, 2);
    expect(fallen).toBe(false);
    expect(world.birds.pink).toMatchObject({ y: -0.6, grounded: true });
    // A soft hop from the dip's floor gets out.
    expect(until(world, (w) => ({ pink: w.birds.pink.grounded && w.birds.pink.y < 0 ? 0.65 : 0, blue: 0 }), (w) => w.birds.pink.y === 0 && w.birds.pink.x > 25)).toBeLessThan(2);
  });

  it("lets a soft hop under the low roof across the dip", () => {
    const { world } = play(standingAt(24.6), once(24.6, 0.65), 2);
    expect(world.birds.pink).toMatchObject({ y: 0, grounded: true });
    expect(world.birds.pink.x).toBeGreaterThan(26);
  });

  it("holds back a Bird that jumps the together gap alone", () => {
    const start = initialWorld();
    start.birds.pink = { ...start.birds.pink, x: 33.6 };
    start.birds.blue = { ...start.birds.blue, x: 30.5 };
    const { world } = play(start, once(33.6, 1), 2);
    expect(world.birds.pink.x).toBeLessThan(34);
  });

  it("won't let a Bird hanging alone in the together gap swing or climb across it", () => {
    expect(loneBirdCrosses(COURSE, 34, 35.8)).toBe(false);
  });

  /** Walks both Birds into the rescue pit, `lead` m apart, and leaves the one behind on the lip. */
  function oneInThePit(): WorldState {
    const start = standingAt(43.5);
    start.birds.blue.x = 41.5;
    return play(start, (w) => ({ pink: w.birds.pink.y >= 0 ? 0.3 : 0, blue: 0 }), 2).world;
  }

  it("catches a Bird in the rescue pit, and it climbs back out by talking", () => {
    const caught = oneInThePit();
    expect(caught.birds.pink).toMatchObject({ y: -1.5, grounded: true });
    const climbing = () => ({ pink: 0.4, blue: 0 });
    expect(until(caught, climbing, (w) => w.birds.pink.y === 0 && w.birds.pink.grounded)).toBeLessThan(6);
  });

  it("can't end the Run: both Birds in the rescue pit is not Fallen, and they jump out and carry on", () => {
    const { world: inPit, fallen } = play(standingAt(43.5), () => ({ pink: 0.3, blue: 0.3 }), 4);
    expect(fallen).toBe(false);
    expect(inPit.birds.pink.y).toBe(-1.5);
    expect(inPit.birds.blue.y).toBe(-1.5);
    const out = play(inPit, (w) => {
      const t = (y: number, grounded: boolean) => (y < 0 ? (grounded ? 1 : 0) : WALK);
      return { pink: t(w.birds.pink.y, w.birds.pink.grounded), blue: t(w.birds.blue.y, w.birds.blue.grounded) };
    }, 10);
    expect(out.fallen).toBe(false);
    expect(Math.min(out.world.birds.pink.x, out.world.birds.blue.x)).toBeGreaterThan(OPENING_END);
  });

  it("has a short hint for each of its six teaching steps, in order along it", () => {
    expect(OPENING_HINTS).toHaveLength(6);
    // Hints are placed along the Opening Piece; the first sits by the Birds at the start line.
    const along = OPENING_HINTS.map((h) => h.at - 30);
    expect(along[0]).toBeGreaterThanOrEqual(0);
    expect(along[0]).toBeLessThan(3);
    expect([...along].sort((a, b) => a - b)).toEqual(along);
    for (const h of OPENING_HINTS) {
      expect(h.at).toBeLessThan(OPENING.length);
      expect(h.text.length).toBeLessThanOrEqual(80);
    }
  });
});
