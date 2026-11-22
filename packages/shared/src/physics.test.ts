import { describe, expect, it } from "vitest";
import type { Bird } from "./bird.ts";
import { TICK_HZ } from "./messages.ts";
import { PHYSICS, TEST_COURSE, initialWorld, stepWorld, type BirdState, type Thrusts, type WorldState } from "./physics.ts";

const TICK = 1 / TICK_HZ;

function run(world: WorldState, thrust: Thrusts, seconds: number): WorldState {
  let w = world;
  for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) w = stepWorld(w, thrust, TICK, TEST_COURSE);
  return w;
}

/** A world with both Birds standing on flat ground, well before the gap. */
function standing(pinkX = 0, blueX = 1): WorldState {
  const w = initialWorld();
  return { ...w, birds: { pink: bird(w.birds.pink, pinkX), blue: bird(w.birds.blue, blueX) } };
}

function bird(b: BirdState, x: number): BirdState {
  return { ...b, x, y: 0, vx: 0, vy: 0 };
}

describe("walking", () => {
  it("a silent Bird stays where it is", () => {
    const end = run(standing(), { pink: 0, blue: 0 }, 2);
    expect(end.birds.pink.x).toBe(0);
    expect(end.birds.blue.x).toBe(1);
  });

  it("a quiet voice walks a Bird forward, and a louder one walks it faster", () => {
    const quiet = run(standing(), { pink: 0.2, blue: 0 }, 1);
    const louder = run(standing(), { pink: 0.5, blue: 0 }, 1);
    expect(quiet.birds.pink.x).toBeGreaterThan(0.3);
    expect(louder.birds.pink.x).toBeGreaterThan(quiet.birds.pink.x + 0.3);
    expect(louder.birds.pink.y).toBe(0);
    expect(louder.birds.blue.x).toBe(1);
  });
});

/** The highest the Bird's feet reach over `seconds`. */
function peak(world: WorldState, thrust: Thrusts, who: Bird, seconds: number): number {
  let w = world;
  let top = w.birds[who].y;
  for (let i = 0; i < Math.round(seconds * TICK_HZ); i++) {
    w = stepWorld(w, thrust, TICK, TEST_COURSE);
    top = Math.max(top, w.birds[who].y);
  }
  return top;
}

describe("jumping", () => {
  it("a voice above the jump threshold jumps, and a louder one jumps higher", () => {
    const walking = peak(standing(), { pink: 0.5, blue: 0 }, "pink", 1);
    const soft = peak(standing(), { pink: 0.7, blue: 0 }, "pink", 1);
    const loud = peak(standing(), { pink: 1, blue: 0 }, "pink", 1);
    expect(walking).toBe(0);
    expect(soft).toBeGreaterThan(0.4);
    expect(loud).toBeGreaterThan(soft + 0.5);
  });

  it("a jumping Bird comes back down onto the ground", () => {
    const end = run(run(standing(), { pink: 1, blue: 0 }, 0.1), { pink: 0, blue: 0 }, 2);
    expect(end.birds.pink.y).toBe(0);
    expect(end.birds.pink.vy).toBe(0);
  });

  it("a voice that rises past the threshold mid-jump still lifts the jump higher", () => {
    const rising = run(standing(), { pink: 0.65, blue: 0 }, TICK);
    const boosted = peak(rising, { pink: 1, blue: 0 }, "pink", 1);
    const steady = peak(rising, { pink: 0.65, blue: 0 }, "pink", 1);
    expect(boosted).toBeGreaterThan(steady + 0.5);
  });
});

describe("the Rope on the ground", () => {
  it("a tight Rope stops the Bird in front, without dragging the one behind", () => {
    const end = run(standing(0, 1), { pink: 0, blue: 0.5 }, 5);
    expect(end.birds.pink.x).toBe(0);
    expect(end.birds.blue.x).toBeCloseTo(PHYSICS.ropeLength, 6);
  });

  it("either Bird can walk past the other and lead", () => {
    const end = run(standing(0, 1), { pink: 0.5, blue: 0 }, 2);
    expect(end.birds.pink.x).toBeGreaterThan(2);
    expect(end.birds.blue.x).toBe(1);
  });
});

const GAP = TEST_COURSE.gaps[0]!;

describe("the gap", () => {
  it("is wider than a Bird can cross by walking, but a loud jump clears it", () => {
    const walked = run(standing(GAP.start - 1, GAP.start - 1.5), { pink: 0.5, blue: 0 }, 2);
    expect(walked.birds.pink.y).toBeLessThan(0);

    const jumped = run(standing(GAP.start - 0.3, GAP.start - 1.5), { pink: 1, blue: 0 }, 0.3);
    const landed = run(jumped, { pink: 0, blue: 0 }, 1);
    expect(landed.birds.pink.y).toBe(0);
    expect(landed.birds.pink.x).toBeGreaterThan(GAP.end);
  });

  it("a Bird that drops into the gap hangs and swings from its partner on the ground", () => {
    const pinkStart = GAP.start - 0.3;
    const blueStart = GAP.start - 2;
    const dropped = run(standing(pinkStart, blueStart), { pink: 0.3, blue: 0 }, 0.5);
    const hanging = run(dropped, { pink: 0, blue: 0 }, 3);

    const { pink, blue } = hanging.birds;
    expect(blue).toMatchObject({ x: blueStart, y: 0 });
    expect(pink.y).toBeLessThan(-1);
    expect(Math.hypot(pink.x - blue.x, pink.y - blue.y)).toBeLessThanOrEqual(PHYSICS.ropeLength + 1e-6);
    // It swung back against the near wall of the gap rather than passing through it.
    expect(pink.x).toBeGreaterThanOrEqual(GAP.start);
  });
});

/** Seconds of `thrust` until `done` holds, or Infinity if it never does within 10 s. */
function secondsUntil(world: WorldState, thrust: Thrusts, done: (w: WorldState) => boolean): number {
  let w = world;
  for (let i = 1; i <= 10 * TICK_HZ; i++) {
    w = stepWorld(w, thrust, TICK, TEST_COURSE);
    if (done(w)) return i / TICK_HZ;
  }
  return Infinity;
}

/** Pink walks into the gap and hangs from Blue, who stands at `blueX`. */
function pinkHangingFrom(blueX: number): WorldState {
  const dropped = run(standing(GAP.start - 0.3, blueX), { pink: 0.3, blue: 0 }, 0.5);
  return run(dropped, { pink: 0, blue: 0 }, 3);
}

const pinkBackOnGround = (w: WorldState) => w.birds.pink.grounded;

describe("rescuing a hanging Bird", () => {
  it("a hanging Bird climbs back out with its voice", () => {
    const hanging = pinkHangingFrom(GAP.start - 2);
    const t = secondsUntil(hanging, { pink: 0.4, blue: 0 }, pinkBackOnGround);
    expect(t).toBeLessThan(6);
  });

  it("a silent hanging Bird stays hanging", () => {
    const hanging = pinkHangingFrom(GAP.start - 2);
    expect(secondsUntil(hanging, { pink: 0, blue: 0 }, pinkBackOnGround)).toBe(Infinity);
  });

  it("its partner hauls it up by walking forward", () => {
    const hanging = pinkHangingFrom(GAP.end + 1);
    const t = secondsUntil(hanging, { pink: 0, blue: 0.4 }, pinkBackOnGround);
    expect(t).toBeLessThan(6);
  });

  it("a Bird can climb out even when its partner stands right at the lip", () => {
    const hanging = pinkHangingFrom(GAP.start - 0.2);
    expect(secondsUntil(hanging, { pink: 0.4, blue: 0 }, pinkBackOnGround)).toBeLessThan(6);
  });

  it("climbing and hauling together is fastest", () => {
    const hanging = pinkHangingFrom(GAP.end + 1);
    const hauled = secondsUntil(hanging, { pink: 0, blue: 0.4 }, pinkBackOnGround);
    const climbed = secondsUntil(hanging, { pink: 0.4, blue: 0 }, pinkBackOnGround);
    const both = secondsUntil(hanging, { pink: 0.4, blue: 0.4 }, pinkBackOnGround);
    expect(both).toBeLessThan(Math.min(hauled, climbed));
  });
});

describe("forgiving ledges", () => {
  /** Pink walks off the near ledge of the gap, then stays off the ground for `seconds`. */
  function offTheLedgeFor(seconds: number): WorldState {
    const start = standing(GAP.start - 0.1, GAP.start - 2);
    const walk = { pink: 0.5, blue: 0 };
    const leftLedge = secondsUntil(start, walk, (w) => !w.birds.pink.grounded);
    return run(start, walk, leftLedge + seconds);
  }

  // Short enough that climbing the Rope can't bring Pink back over the lip.
  const WINDOW = 0.3;

  it("a Bird can still jump just after walking off a ledge", () => {
    const justOff = offTheLedgeFor(0.1);
    expect(justOff.birds.pink.y).toBeLessThan(0);
    expect(peak(justOff, { pink: 1, blue: 0 }, "pink", WINDOW)).toBeGreaterThan(0.5);
  });

  it("but not once the grace period has passed", () => {
    const longOff = offTheLedgeFor(0.4);
    expect(peak(longOff, { pink: 1, blue: 0 }, "pink", WINDOW)).toBeLessThan(0);
  });
});

describe("Fallen", () => {
  const isFallen = (w: WorldState) => w.fallen;

  it("both Birds dropping into the gap is Fallen", () => {
    const start = standing(GAP.start - 0.3, GAP.start - 1);
    expect(secondsUntil(start, { pink: 0.3, blue: 0.3 }, isFallen)).toBeLessThan(2);
  });

  it("one Bird hanging from its partner is not Fallen", () => {
    expect(secondsUntil(pinkHangingFrom(GAP.start - 2), { pink: 0, blue: 0 }, isFallen)).toBe(Infinity);
  });

  it("a Bird that walks off a ledge while its partner hangs still gets its grace period first", () => {
    const hanging = pinkHangingFrom(GAP.start - 2);
    const blueOff = secondsUntil(hanging, { pink: 0, blue: 0.5 }, (w) => !w.birds.blue.grounded);
    const fallen = secondsUntil(hanging, { pink: 0, blue: 0.5 }, isFallen);
    expect(fallen).toBeGreaterThanOrEqual(blueOff + PHYSICS.ledgeGraceSeconds);
    expect(fallen).toBeLessThan(Infinity);
  });

  it("both Birds in the air over the ground is not Fallen", () => {
    // Past the gap, so their hops only ever land on ground.
    expect(secondsUntil(standing(GAP.end + 1, GAP.end + 2), { pink: 1, blue: 1 }, isFallen)).toBe(Infinity);
  });
});

describe("the Rope in the air", () => {
  it("a Bird pulled down by the Rope over solid ground lands on it instead of in the gap", () => {
    const w = standing(GAP.start + 0.9, GAP.start - 0.4);
    // Pink deep in the gap, Blue just off the ground near the lip, the Rope taut between them.
    w.birds.pink = { ...w.birds.pink, y: -4.2, grounded: false, airTime: 1 };
    w.birds.blue = { ...w.birds.blue, y: 0.05, grounded: false, airTime: 0.5, jumped: true };
    const end = run(w, { pink: 0, blue: 0 }, 0.5);
    expect(end.birds.blue.x).toBeLessThan(GAP.start);
    expect(end.birds.blue.y).toBe(0);
    expect(end.birds.blue.grounded).toBe(true);
  });
});
