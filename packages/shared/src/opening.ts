import type { Piece, Span } from "./course.ts";

/**
 * The Opening: the hand-made first stretch of the Course that teaches the controls, played on a
 * Team's first Run (or when replayed) in place of the plain start. Like the start, it reaches
 * `BEHIND` meters behind the start line, where the Birds stand at 0.
 *
 * It is laid out here in Course meters (0 = the start line) and stored as a Piece, measured from
 * its own start like any other.
 */
const BEHIND = 30;

/** A short on-screen hint for one teaching step, drawn at `at` meters along the Opening Piece. */
export interface Hint {
  at: number;
  text: string;
}

/** Where each teaching step is, in Course meters. */
const STEPS = {
  walk: 1,
  edge: 10,
  hop: 14,
  /** A dip under a low ceiling: a soft hop crosses it, a loud one bonks and drops in. Its floor catches the Bird. */
  roof: { from: 22, to: 29, dip: { from: 25, to: 26, floor: -0.6 } },
  /** A gap that needs a loud jump: one Bird jumping alone is held back by the Rope. */
  together: { from: 34, to: 35.8 },
  /** A pit with a floor: a Bird that drops in is caught, then climbs or is hauled out. */
  pit: { from: 44, to: 46, floor: -1.5 },
  end: 56,
} as const;

const course = (s: Span): Span => ({ from: s.from + BEHIND, to: s.to + BEHIND, height: s.height });

export const OPENING: Piece = {
  name: "opening",
  tier: "easy",
  length: STEPS.end + BEHIND,
  ground: [
    { from: -BEHIND, to: STEPS.hop, height: 0 },
    // A 1 m gap: stop at its edge by going quiet, then hop it.
    { from: STEPS.hop + 1, to: STEPS.roof.dip.from, height: 0 },
    { from: STEPS.roof.dip.from, to: STEPS.roof.dip.to, height: STEPS.roof.dip.floor },
    { from: STEPS.roof.dip.to, to: STEPS.together.from, height: 0 },
    { from: STEPS.together.to, to: STEPS.pit.from, height: 0 },
    { from: STEPS.pit.from, to: STEPS.pit.to, height: STEPS.pit.floor },
    { from: STEPS.pit.to, to: STEPS.end, height: 0 },
  ].map(course),
  ceilings: [{ from: STEPS.roof.from, to: STEPS.roof.to, height: 1.8 }].map(course),
};

/** The hints, one per teaching step, in the order they are met. */
export const OPENING_HINTS: readonly Hint[] = [
  { at: STEPS.walk, text: "Talk to walk: any sound moves your Bird" },
  { at: STEPS.edge, text: "Go quiet to stop at the edge" },
  { at: STEPS.hop, text: "A short loud “hup!” hops the gap" },
  { at: STEPS.roof.from - 1.5, text: "Low roof: hop softly, too loud bonks your head" },
  { at: STEPS.together.from - 3, text: "Jump this gap together: the Rope holds you back" },
  { at: STEPS.pit.from - 3, text: "One of you drop in the pit: talk to climb out, or the other walks on to haul" },
].map((h) => ({ ...h, at: h.at + BEHIND }));
