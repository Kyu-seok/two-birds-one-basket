import type { Piece } from "./course.ts";

/**
 * The Medium and Hard Pieces. Every hazard works by dropping a Bird (ADR 0007): crumbling and
 * moving platforms, gusts and low ceilings never kill on touch, and a dropped Bird hangs from the
 * Rope to be rescued. Ceilings and narrow landings punish a jump that's too loud as much as one
 * that's too soft (ADR 0008).
 *
 * The Run's clock drives the timed hazards, so they are the same for both players. Each Piece's
 * crossing is played through by scripted players in `hazard-pieces.test.ts`.
 *
 * Handy numbers: a jump carries about 3 m/s forward; one just past the threshold rises 0.6 m and
 * carries 1.5 m, a full one rises 2 m and carries 2.7 m. The Rope is 4 m.
 */
export const MEDIUM_PIECES: readonly Piece[] = [
  {
    // Too wide for one Bird to jump while its partner hangs back: the Rope holds it short. Jump together.
    name: "together gap",
    tier: "medium",
    length: 12,
    ground: [
      { from: 0, to: 5, height: 0 },
      { from: 6.8, to: 12, height: 0 },
    ],
    ceilings: [],
  },
  {
    // Each platform holds for 1.5 s after a Bird first lands on it, gives way for 3 s, then is back.
    name: "crumbling platforms",
    tier: "medium",
    length: 15,
    ground: [
      { from: 0, to: 4, height: 0 },
      { from: 5.2, to: 6.8, height: 0, crumble: { holdSeconds: 1.5, goneSeconds: 3 } },
      { from: 8, to: 9.6, height: 0, crumble: { holdSeconds: 1.5, goneSeconds: 3 } },
      { from: 10.8, to: 15, height: 0 },
    ],
    ceilings: [],
  },
  {
    // Wider than the Easy one, under a lower ceiling: only a soft hop gets across.
    name: "ceiling gap",
    tier: "medium",
    length: 11,
    ground: [
      { from: 0, to: 5, height: 0 },
      { from: 6.2, to: 11, height: 0 },
    ],
    ceilings: [{ from: 2.5, to: 8.5, height: 1.7 }],
  },
  {
    // A platform shuttles 3.4 m across a 7 m gap every 6 s. Hop on together, ride, hop off together.
    name: "moving platform",
    tier: "medium",
    length: 17,
    ground: [
      { from: 0, to: 5, height: 0 },
      { from: 6, to: 7.6, height: 0, move: { dx: 3.4, period: 6 } },
      { from: 12, to: 17, height: 0 },
    ],
    ceilings: [],
  },
];

export const HARD_PIECES: readonly Piece[] = [
  {
    // Steps up to a ledge 2.4 m high, under a roof that bonks any jump off it, over a 3 m gap: too
    // wide to jump. One Bird anchors silent at the lip; the other drops off, swings across with a
    // jump-level voice and catches the far ledge, then hauls its partner over.
    name: "rope swing",
    tier: "hard",
    length: 19,
    ground: [
      { from: 0, to: 3, height: 0 },
      { from: 3, to: 5, height: 0.8 },
      { from: 5, to: 7, height: 1.6 },
      { from: 7, to: 11, height: 2.4 },
      { from: 14, to: 19, height: 0 },
    ],
    ceilings: [{ from: 9, to: 12, height: 3.4 }],
  },
  {
    // A headwind blows for 2 s in every 4 s: a Bird can still walk into it, but a jump into it falls
    // short. Jump in the calm.
    name: "gusts",
    tier: "hard",
    length: 12,
    ground: [
      { from: 0, to: 5, height: 0 },
      { from: 6.8, to: 12, height: 0 },
    ],
    ceilings: [],
    gusts: [{ from: 0, to: 9, push: -1.5, period: 4, on: 2 }],
  },
  {
    // Narrow pillars, 2.2 m apart: a jump too soft falls short, one too loud overshoots. The Rope
    // keeps the Birds a pillar apart at most, so they go in step: as the one in front jumps to
    // the next pillar, the other jumps onto the one it left.
    name: "narrow pillars",
    tier: "hard",
    length: 18,
    ground: [
      { from: 0, to: 5, height: 0 },
      { from: 6.5, to: 7.2, height: 0 },
      { from: 8.7, to: 9.4, height: 0 },
      { from: 10.9, to: 11.6, height: 0 },
      { from: 13.1, to: 18, height: 0 },
    ],
    ceilings: [],
  },
  {
    // Three small gaps and short landings under a low ceiling: soft, precise hops all the way.
    name: "ceiling run",
    tier: "hard",
    length: 17,
    ground: [
      { from: 0, to: 4, height: 0 },
      { from: 5, to: 6.4, height: 0 },
      { from: 7.4, to: 8.8, height: 0 },
      { from: 9.8, to: 11.2, height: 0 },
      { from: 12.2, to: 17, height: 0 },
    ],
    ceilings: [{ from: 2.5, to: 14, height: 1.6 }],
  },
];
