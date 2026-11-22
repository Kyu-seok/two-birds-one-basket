import { HARD_PIECES, MEDIUM_PIECES } from "./hazard-pieces.ts";
import { OPENING } from "./opening.ts";

/**
 * The Course and the Pieces it is built from. The same Piece data drives the server's
 * collisions (`physics.ts`) and the client's drawing, and a Run's Course is rebuilt on each
 * side from one seed, so no geometry is ever sent.
 *
 * World units are meters; x runs along the Course, y points up, and ground level is y = 0.
 */
export type Tier = "easy" | "medium" | "hard";
export const TIERS: readonly Tier[] = ["easy", "medium", "hard"];

/** A stretch of a Piece, `from`..`to` measured from the Piece's start, at `height`. */
export interface Span {
  from: number;
  to: number;
  height: number;
  /** A moving platform: slides back and forth on a timed pattern (ground only). */
  move?: Motion;
  /** A crumbling platform: gives way a while after a Bird first stands on it, then comes back (ground only). */
  crumble?: Crumble;
}

/**
 * Timed hazards follow the Run's clock, so they are the same for both players. A moving span is
 * offset by `dx * (1 - cos(2π (time / period + phase))) / 2`: it starts where the Piece puts it,
 * slides `dx` meters along the Course and back once every `period` seconds.
 */
export interface Motion {
  dx: number;
  period: number;
  phase?: number;
}

/** A crumbling span holds for `holdSeconds` after a Bird first stands on it, is gone for `goneSeconds`, then is back as new. */
export interface Crumble {
  holdSeconds: number;
  goneSeconds: number;
}

/**
 * A gust over `from`..`to` that blows in bursts: for the first `on` seconds of every `period`
 * (shifted by `phase` periods), it pushes any Bird there along the Course at `push` m/s
 * (negative blows it back). It only ever pushes; it never hurts.
 */
export interface Gust {
  from: number;
  to: number;
  push: number;
  period: number;
  on: number;
  phase?: number;
}

/**
 * One hand-made building block of the Course. Every Piece starts and ends on ground at height 0,
 * so any Piece can follow any other.
 */
export interface Piece {
  name: string;
  tier: Tier;
  length: number;
  /**
   * Solid ground, its surface at `height` and solid all the way down. Where no span covers, there
   * is a bottomless gap. Neighbouring spans of different heights make a step, whose side is a
   * wall. Ground below 0 is the floor of a pit: a Bird down there is caught, not Fallen.
   */
  ground: readonly Span[];
  /** Low ceilings: solid from `height` all the way up. A Bird that jumps into one bonks its head. */
  ceilings: readonly Span[];
  /** Gusts blowing in bursts over parts of the Piece. */
  gusts?: readonly Gust[];
}

/** A Piece placed on the Course, starting at `x`. */
export interface PlacedPiece {
  x: number;
  piece: Piece;
}

export interface Course {
  /** The Pieces overlapping `from`..`to`, in order along the Course. An endless Course builds them as needed. */
  piecesBetween(from: number, to: number): readonly PlacedPiece[];
  /** Where Distance counts from: where the random Pieces begin, past the start or the Opening. */
  distanceFrom: number;
}

/** A one-off stretch of Course from ground and ceiling spans given in Course coordinates, for tests and tools. */
export function courseOf(ground: readonly Span[], ceilings: readonly Span[] = []): Course {
  const x = Math.min(...ground.map((s) => s.from), ...ceilings.map((s) => s.from));
  const end = Math.max(...ground.map((s) => s.to), ...ceilings.map((s) => s.to));
  const shift = (s: Span) => ({ ...s, from: s.from - x, to: s.to - x });
  return fixedCourse([{ x, piece: { name: "test", tier: "easy", length: end - x, ground: ground.map(shift), ceilings: ceilings.map(shift) } }]);
}

/** The placed Pieces overlapping `from`..`to`. */
function overlapping(placed: readonly PlacedPiece[], from: number, to: number): PlacedPiece[] {
  return placed.filter((p) => p.x <= to && p.x + p.piece.length >= from);
}

/** A Course of a fixed list of placed Pieces, its Distance counted from `distanceFrom`. */
export function fixedCourse(placed: readonly PlacedPiece[], distanceFrom = 0): Course {
  return { piecesBetween: (from, to) => overlapping(placed, from, to), distanceFrom };
}

const flat = (name: string, length: number): Piece => ({
  name,
  tier: "easy",
  length,
  ground: [{ from: 0, to: length, height: 0 }],
  ceilings: [],
});

/** Flat ground the Birds start on, reaching well behind the start; the Opening replaces it when played. */
export const START_PIECE: Piece = flat("start", 40);
const START_X = -30;

/**
 * Every Piece the Course can be built from. Sizes forgive a server round trip (ADR 0002):
 * long flat run-ups and landings, steps a soft jump clears, and gaps a soft jump crosses.
 *
 * A soft jump (just past the jump threshold) rises about 0.6 m and carries about 1.5 m forward;
 * a full-Thrust jump rises about 2 m. A Bird is `PHYSICS.birdHeight` (0.7 m) tall.
 */
export const PIECES: readonly Piece[] = [
  flat("flat walk", 8),
  {
    name: "small gap",
    tier: "easy",
    length: 8,
    ground: [
      { from: 0, to: 4, height: 0 },
      { from: 5, to: 8, height: 0 },
    ],
    ceilings: [],
  },
  {
    name: "gap",
    tier: "easy",
    length: 9,
    ground: [
      { from: 0, to: 4, height: 0 },
      { from: 5.4, to: 9, height: 0 },
    ],
    ceilings: [],
  },
  {
    name: "steps",
    tier: "easy",
    length: 13,
    ground: [
      { from: 0, to: 3, height: 0 },
      { from: 3, to: 5.5, height: 0.4 },
      { from: 5.5, to: 8, height: 0.8 },
      { from: 8, to: 10, height: 0.4 },
      { from: 10, to: 13, height: 0 },
    ],
    ceilings: [],
  },
  {
    name: "step",
    tier: "easy",
    length: 10,
    ground: [
      { from: 0, to: 3, height: 0 },
      { from: 3, to: 7, height: 0.4 },
      { from: 7, to: 10, height: 0 },
    ],
    ceilings: [],
  },
  {
    // A soft hop crosses the gap under the ceiling; a loud jump bonks and drops into it (ADR 0008).
    name: "low ceiling",
    tier: "easy",
    length: 12,
    ground: [
      { from: 0, to: 5.5, height: 0 },
      { from: 6.5, to: 12, height: 0 },
    ],
    ceilings: [{ from: 3, to: 9, height: 1.8 }],
  },
  ...MEDIUM_PIECES,
  ...HARD_PIECES,
];

/**
 * How likely each Tier is for the next Piece at `distance` meters (counted, like Distance, from
 * where the random Pieces begin). All Easy at the start; Medium creeps in after 30 m and Hard after 120 m, until Easy is rare.
 */
export function tierWeights(distance: number): Record<Tier, number> {
  const ramp = (start: number, span: number) => Math.min(1, Math.max(0, (distance - start) / span));
  const raw = { easy: 1 - 0.85 * ramp(30, 800), medium: 1.2 * ramp(30, 200), hard: 1.5 * ramp(120, 600) };
  const total = raw.easy + raw.medium + raw.hard;
  return { easy: raw.easy / total, medium: raw.medium / total, hard: raw.hard / total };
}

/** A small, fast, seeded random number generator (mulberry32): the same seed gives the same numbers everywhere. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks the next Piece at Distance `distance`: a Tier by weight, then a Piece of it (or of the nearest easier Tier that has one). */
function nextPiece(random: () => number, distance: number, catalog: readonly Piece[]): Piece {
  const weights = tierWeights(distance);
  let roll = random();
  let tierIndex = TIERS.length - 1;
  for (let i = 0; i < TIERS.length; i++) {
    roll -= weights[TIERS[i]!];
    if (roll < 0) {
      tierIndex = i;
      break;
    }
  }
  for (let i = tierIndex; i >= 0; i--) {
    const choices = catalog.filter((p) => p.tier === TIERS[i]);
    if (choices.length) return choices[Math.floor(random() * choices.length)]!;
  }
  return catalog[Math.floor(random() * catalog.length)]!;
}

/**
 * The endless Course of one Run: `first` (the start, or the Opening), then Pieces in random order
 * from `catalog`, the same for the same seed. It extends as far as anything asks.
 */
export function randomCourse(seed: number, catalog: readonly Piece[] = PIECES, first: Piece = START_PIECE): Course {
  const random = seededRandom(seed);
  const placed: PlacedPiece[] = [{ x: START_X, piece: first }];
  const end = () => placed.at(-1)!.x + placed.at(-1)!.piece.length;
  const distanceFrom = end();
  return {
    distanceFrom,
    piecesBetween(from, to) {
      while (end() < to) {
        const x = end();
        placed.push({ x, piece: nextPiece(random, x - distanceFrom, catalog) });
      }
      return overlapping(placed, from, to);
    },
  };
}

const memo = new Map<string, Course>();

/**
 * The Course for a Run's seed, starting with the Opening if `opening`, kept for reuse: the server
 * steps it 30 times a second and the client draws it every frame.
 */
export function courseForSeed(seed: number, opening = false): Course {
  const key = `${seed}${opening ? "+opening" : ""}`;
  let course = memo.get(key);
  if (!course) {
    course = randomCourse(seed, PIECES, opening ? OPENING : START_PIECE);
    memo.set(key, course);
    // Only the last few Runs' Courses are kept.
    if (memo.size > 8) memo.delete(memo.keys().next().value!);
  }
  return course;
}

/** A new seed for a Run's Course. */
export function newCourseSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
