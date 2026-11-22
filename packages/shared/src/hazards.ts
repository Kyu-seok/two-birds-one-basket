import type { Course, Crumble, Gust, Motion, Span } from "./course.ts";

/**
 * Where the Course's timed hazards are at a moment of the Run. The server collides with this and
 * the clients draw it, from the same Piece data, the Run's clock and the crumble state in the world,
 * so both players always see the same thing.
 */

/** When each crumbling span was first stood on, in Run seconds, by its key. Kept in the world. */
export type Crumbling = Readonly<Record<string, number>>;

/** A ground span placed on the Course, in Course coordinates. */
export interface PlacedSpan extends Span {
  /** Which span of which placed Piece this is, the same at every moment of the Run. */
  key: string;
}

/** A gust placed on the Course, in Course coordinates. */
export type PlacedGust = Gust;

export interface Layout {
  ground: PlacedSpan[];
  ceilings: Span[];
  gusts: PlacedGust[];
}

/** How far a moving span has slid from where its Piece puts it, at Run `time`. */
export function motionOffset(m: Motion, time: number): number {
  return (m.dx * (1 - Math.cos(2 * Math.PI * (time / m.period + (m.phase ?? 0))))) / 2;
}

/** How long after first being stood on a crumbling span is back as new. */
function crumbleCycle(c: Crumble): number {
  return c.holdSeconds + c.goneSeconds;
}

/** Whether a crumbling span first stood on at `touchedAt` has given way at `time`. */
export function hasCrumbled(span: Span, touchedAt: number | undefined, time: number): boolean {
  if (!span.crumble || touchedAt === undefined) return false;
  const since = time - touchedAt;
  return since >= span.crumble.holdSeconds && since < crumbleCycle(span.crumble);
}

/** Whether a crumbling span first stood on at `touchedAt` has come back as new by `time`. */
export function hasReformed(span: Span, touchedAt: number, time: number): boolean {
  return !span.crumble || time - touchedAt >= crumbleCycle(span.crumble);
}

/** Whether `gust` is blowing at Run `time`. */
export function isBlowing(gust: Gust, time: number): boolean {
  const into = time / gust.period + (gust.phase ?? 0);
  return (into - Math.floor(into)) * gust.period < gust.on;
}

/** The Course between `from` and `to` at Run `time`: moving spans where they are, crumbled ones left out. */
export function layoutAt(course: Course, from: number, to: number, time: number, crumbling: Crumbling = {}): Layout {
  const layout: Layout = { ground: [], ceilings: [], gusts: [] };
  for (const { x, piece } of course.piecesBetween(from, to)) {
    piece.ground.forEach((s, i) => {
      const key = `${x}:${i}`;
      if (hasCrumbled(s, crumbling[key], time)) return;
      const shift = x + (s.move ? motionOffset(s.move, time) : 0);
      layout.ground.push({ ...s, key, from: s.from + shift, to: s.to + shift });
    });
    for (const c of piece.ceilings) layout.ceilings.push({ ...c, from: c.from + x, to: c.to + x });
    for (const g of piece.gusts ?? []) layout.gusts.push({ ...g, from: g.from + x, to: g.to + x });
  }
  return layout;
}

/** The gusts' push along the Course at `x` and Run `time`, in m/s. */
export function windAt(layout: Layout, x: number, time: number): number {
  let push = 0;
  for (const g of layout.gusts) if (x >= g.from && x <= g.to && isBlowing(g, time)) push += g.push;
  return push;
}
