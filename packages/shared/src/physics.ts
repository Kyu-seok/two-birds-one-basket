import { BIRDS, partnerOf, type Bird, type PerBird } from "./bird.ts";
import type { Course, Span } from "./course.ts";
import { hasReformed, layoutAt, windAt, type Crumbling, type Layout, type PlacedSpan } from "./hazards.ts";

/**
 * World units are meters; y points up and ground level is y = 0. Raised ground (steps) sits above
 * it; only a gap goes below it. A Bird's x, y is its feet; its body reaches `PHYSICS.birdHeight` up.
 */
export interface BirdState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** Seconds since the Bird last stood on the ground, or since it jumped. */
  airTime: number;
  /** Whether it left the ground by jumping (rather than walking off a ledge). */
  jumped: boolean;
}

export interface WorldState {
  birds: PerBird<BirdState>;
  /** How much Rope is let out between the Birds; a hanging Bird shortens it by climbing. */
  ropeLength: number;
  /**
   * Both Birds have dropped below ground level, so nothing can hold them up any more. Only a gap
   * goes below ground level.
   */
  fallen: boolean;
  /** Seconds since the Run started. Timed hazards (moving and crumbling platforms, gusts) follow it. */
  time: number;
  /** When each crumbling platform was first stood on (see `hazards.ts`). */
  crumbling: Crumbling;
}

/** Each Bird's Thrust, 0..1. */
export type Thrusts = PerBird<number>;

export const PHYSICS = {
  gravity: 20,
  /**
   * Thrust below this counts as silence, so the Bird stands still. It's a small margin above
   * the Noise Floor, which Calibration (#8) will set properly.
   */
  walkThreshold: 0.08,
  /** Walking speed (m/s) just above silence, and just below a jump. Slow, so ledges forgive lag (ADR 0002). */
  walkSpeedMin: 0.8,
  walkSpeedMax: 2.5,
  /** Thrust at or above this jumps. */
  jumpThreshold: 0.6,
  /** Take-off speed (m/s) at the jump threshold and at full Thrust: about 0.6 m and 2 m high. */
  jumpSpeedMin: 5,
  jumpSpeedMax: 9,
  /** Forward speed while in a jump. */
  jumpForwardSpeed: 3,
  /**
   * For this long after take-off a louder voice still raises the jump. The mic rises over
   * a few ticks, so the first tick past the threshold is rarely the voice's peak.
   */
  jumpBoostSeconds: 0.2,
  /** From a Bird's feet to the top of its head: a low ceiling bonks it there. */
  birdHeight: 0.7,
  /** Long enough for one Bird to fall into a gap and be rescued. */
  ropeLength: 4,
  /** How long after walking off a ledge a Bird can still jump. */
  ledgeGraceSeconds: 0.2,
  /** A climbing Bird can't pull itself closer than this to its partner. */
  ropeLengthMin: 0.5,
  /**
   * How hard a jump-level voice pushes a Bird hanging on a taut Rope forward along its swing
   * (m/s²): enough to swing it from hanging still most of the way up to level with its partner.
   */
  swingPush: 10,
  /** How far below or above a ledge's top a swinging Bird can be and still catch it. */
  grabReach: 0.5,
} as const;

function standingBird(x: number): BirdState {
  return { x, y: 0, vx: 0, vy: 0, grounded: true, airTime: 0, jumped: false };
}

export function initialWorld(): WorldState {
  return { birds: { pink: standingBird(0), blue: standingBird(1.5) }, ropeLength: PHYSICS.ropeLength, fallen: false, time: 0, crumbling: {} };
}

/** Advances the world by one simulation tick. Pure: returns a new state. */
export function stepWorld(w: WorldState, thrust: Thrusts, dt: number, course: Course): WorldState {
  const time = w.time + dt;
  // The Course near a point before and after this tick: moving platforms move with the Run's clock.
  const before: Around = (x) => layoutAt(course, x - NEAR, x + NEAR, w.time, w.crumbling);
  const after: Around = (x) => layoutAt(course, x - NEAR, x + NEAR, time, w.crumbling);

  // A hanging Bird climbs hand over hand, at its walking pace, taking in Rope. A jump-level voice
  // swings it instead (see `swung`).
  let ropeLength = w.ropeLength;
  for (const bird of BIRDS) {
    const climbing = isHanging(w.birds, bird) || isSwinging(w.birds[bird], w.birds[partnerOf(bird)], w.ropeLength);
    if (climbing && thrust[bird] < PHYSICS.jumpThreshold) ropeLength -= walkSpeed(thrust[bird]) * dt;
  }
  ropeLength = Math.max(PHYSICS.ropeLengthMin, ropeLength);

  const step = (bird: Bird) => {
    const b = swung(w, bird, thrust[bird], dt);
    return stepBird(b, thrust[bird], dt, after, carried(b, before, after), windAt(after(b.x), b.x, time));
  };
  const birds = { pink: step("pink"), blue: step("blue") };
  // Back on the ground together, the Rope is let out again.
  if (bothStanding(birds)) ropeLength = PHYSICS.ropeLength;
  holdRope(birds, ropeLength, after);
  for (const bird of BIRDS) {
    if (ropeLength <= PHYSICS.ropeLengthMin) climbOverLip(birds[bird], birds[partnerOf(bird)], after);
  }
  for (const bird of BIRDS) catchLedge(birds[bird], birds[partnerOf(bird)], ropeLength, after);
  return {
    birds,
    ropeLength,
    fallen: BIRDS.every((bird) => hasDropped(birds[bird], after)),
    time,
    crumbling: crumble(w.crumbling, birds, after, time),
  };
}

/** The Course near `x` at one moment of this tick. */
type Around = (x: number) => Layout;

/** How much slack still counts as a taut Rope. */
const TAUT = 0.05;

/** A Bird off the ground, below its partner standing on ground, at the end of a taut Rope. */
function isSwinging(b: BirdState, anchor: BirdState, length: number): boolean {
  return !b.grounded && anchor.grounded && b.y < anchor.y && Math.hypot(b.x - anchor.x, b.y - anchor.y) >= length - TAUT;
}

/**
 * A swinging Bird with a jump-level voice pushes itself forward along its swing, across the Rope.
 * This is how it gets across a gap too wide to jump while its partner anchors.
 */
function swung(w: WorldState, bird: Bird, thrust: number, dt: number): BirdState {
  const b = w.birds[bird];
  const anchor = w.birds[partnerOf(bird)];
  if (thrust < PHYSICS.jumpThreshold || !isSwinging(b, anchor, w.ropeLength)) return b;
  const dist = Math.hypot(b.x - anchor.x, b.y - anchor.y);
  // Across the Rope, the way the Course goes.
  let tx = -(b.y - anchor.y) / dist;
  let ty = (b.x - anchor.x) / dist;
  if (tx < 0) (tx = -tx), (ty = -ty);
  const push = PHYSICS.swingPush * dt;
  return { ...b, vx: b.vx + tx * push, vy: b.vy + ty * push };
}

/**
 * A swinging Bird that reaches the top of a ledge other than its partner's catches it and stands
 * there: within `grabReach` below it (its wall) or above it.
 */
function catchLedge(b: BirdState, anchor: BirdState, length: number, around: Around) {
  if (!isSwinging(b, anchor, length)) return;
  const near = around(b.x);
  const home = standingOn(near, anchor.x, anchor.y);
  const ledge = near.ground.find(
    (s) => s.key !== home?.key && b.x >= s.from && b.x <= s.to && Math.abs(b.y - s.height) <= PHYSICS.grabReach,
  );
  if (ledge) land(b, ledge.height);
}

/** How far the moving platform a Bird stands on carries it this tick. */
function carried(b: BirdState, before: Around, after: Around): number {
  if (!b.grounded) return 0;
  const under = standingOn(before(b.x), b.x, b.y);
  if (!under?.move) return 0;
  const moved = after(b.x).ground.find((s) => s.key === under.key);
  return moved ? moved.from - under.from : 0;
}

/** The span a Bird with its feet at `x`, `y` stands on, if any. */
function standingOn(near: Layout, x: number, y: number): PlacedSpan | undefined {
  return near.ground.find((g) => x >= g.from && x <= g.to && Math.abs(g.height - y) < 1e-6);
}

/** How far behind the Birds a crumbled platform is forgotten. */
const CRUMBLE_MEMORY = 50;

/** Starts the clock on each crumbling platform a Bird stands on for the first time (or again, once it is back). */
function crumble(was: Crumbling, birds: PerBird<BirdState>, after: Around, time: number): Crumbling {
  let next: Record<string, number> | undefined;
  const edit = () => (next ??= { ...was });
  for (const bird of BIRDS) {
    const b = birds[bird];
    if (!b.grounded) continue;
    const span = standingOn(after(b.x), b.x, b.y);
    if (!span?.crumble) continue;
    const touched = (next ?? was)[span.key];
    if (touched !== undefined && !hasReformed(span, touched, time)) continue;
    edit()[span.key] = time;
  }
  const behind = Math.min(birds.pink.x, birds.blue.x) - CRUMBLE_MEMORY;
  for (const key of Object.keys(next ?? was)) {
    if (Number.parseFloat(key) < behind) delete edit()[key];
  }
  return next ?? was;
}

/**
 * A Bird is hanging when it has dropped below ground level while its partner stands on ground
 * at or above it, so the Rope can bring it up. One standing on a pit's floor counts too.
 */
function isHanging(birds: PerBird<BirdState>, bird: Bird): boolean {
  const partner = birds[partnerOf(bird)];
  return birds[bird].y < 0 && partner.grounded && partner.y >= 0;
}

/** Both Birds stand on ground, and neither is down a pit below the other: the Rope is theirs to walk with. */
function bothStanding(birds: PerBird<BirdState>): boolean {
  return BIRDS.every((bird) => birds[bird].grounded && !isHanging(birds, bird));
}

/** Just off a ledge, a Bird can still jump: its own voice reaches the server a round trip late (ADR 0002). */
function inLedgeGrace(b: BirdState): boolean {
  return !b.grounded && !b.jumped && b.airTime < PHYSICS.ledgeGraceSeconds;
}

/**
 * Below the surface, sinking, too late to jump back out, and with no floor under it: only the
 * Rope can hold it now. A pit's floor holds it like the Rope would.
 */
function hasDropped(b: BirdState, around: Around): boolean {
  return b.y < 0 && b.vy <= 0 && !inLedgeGrace(b) && groundBelow(around(b.x), b.x, b.y) === null;
}

/** A climber that has taken in all the Rope it can scrambles onto the lip on its partner's side. */
function climbOverLip(b: BirdState, partner: BirdState, around: Around) {
  if (!partner.grounded || b.grounded) return;
  const near = around(b.x);
  if (b.y >= 0) {
    // Up the side of raised ground: onto the partner's ledge, at its edge.
    const ledge = standingOn(near, partner.x, partner.y);
    if (!ledge || b.y >= partner.y) return;
    land(b, ledge.height);
    b.x = Math.min(ledge.to, Math.max(ledge.from, b.x));
    b.vx = 0;
    return;
  }
  const gap = nearestGap(near, b.x);
  if (!gap) return;
  const lip = partner.x <= gap.start ? gap.start : gap.end;
  land(b, surfaceAt(near, lip));
  b.x = lip;
  b.vx = 0;
}

function land(b: BirdState, height: number) {
  b.y = height;
  b.vy = 0;
  b.grounded = true;
  b.jumped = false;
  b.airTime = 0;
}

/**
 * Moves one Bird by its own voice, plus `carry` meters from a moving platform under it and a
 * gust's `wind` (m/s along the Course).
 */
function stepBird(b: BirdState, thrust: number, dt: number, around: Around, carry: number, wind: number): BirdState {
  let { vx, vy, jumped, airTime } = b;
  if (b.grounded) vx = walkSpeed(thrust);
  if (b.grounded || inLedgeGrace(b)) {
    if (thrust >= PHYSICS.jumpThreshold) {
      vy = jumpSpeed(thrust);
      vx = PHYSICS.jumpForwardSpeed;
      jumped = true;
      airTime = 0;
    }
  } else if (jumped && airTime < PHYSICS.jumpBoostSeconds && thrust >= PHYSICS.jumpThreshold) {
    // What this voice would have jumped, less the speed gravity has taken since take-off.
    vy = Math.max(vy, jumpSpeed(thrust) - PHYSICS.gravity * airTime);
  }

  vy -= PHYSICS.gravity * dt;
  const near = around(b.x);
  const next: BirdState = { ...b, x: b.x + (vx + wind) * dt + carry, y: b.y, vx, vy, grounded: false, jumped };
  next.airTime = airTime + dt;

  // Across first: the side of a step, of a low ceiling or of a pit is a wall.
  const wall = solidAt(near, next.x, b.y);
  if (wall) {
    next.x = edgeFacing(wall, b.x);
    next.vx = 0;
  }

  // Then up or down.
  next.y = b.y + vy * dt;
  const ceiling = ceilingAbove(near, next.x, b.y + PHYSICS.birdHeight);
  if (ceiling !== null && next.y + PHYSICS.birdHeight > ceiling) {
    // Bonk: a jump that's too loud hits its head, loses its way forward and drops (ADR 0008).
    next.y = ceiling - PHYSICS.birdHeight;
    next.vy = Math.min(0, next.vy);
    next.vx = 0;
  }
  const floor = groundBelow(near, next.x, b.y);
  if (floor !== null && next.y <= floor) land(next, floor);
  keepOutOfWalls(next, near);
  return next;
}

/** Pulls the Birds back within the Rope's length. Mutates the freshly stepped Birds. */
function holdRope(birds: PerBird<BirdState>, length: number, around: Around) {
  const { pink, blue } = birds;
  const dx = blue.x - pink.x;
  const dy = blue.y - pink.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= length) return;

  if (bothStanding(birds)) {
    // On the ground the Rope stops the Bird in front; it never drags the one behind.
    const [behind, front] = pink.x <= blue.x ? [pink, blue] : [blue, pink];
    front.x = behind.x + length;
    front.vx = Math.min(front.vx, behind.vx);
    return;
  }

  // Off the ground it is a real rope. A Bird standing on the ground holds firm; Birds in the
  // air share the pull equally. A Bird on a pit's floor is lifted off it by its partner above.
  const before = { pink: { x: pink.x, y: pink.y }, blue: { x: blue.x, y: blue.y } };
  const holds = (bird: Bird) => birds[bird].grounded && !isHanging(birds, bird);
  const pinkShare = holds("pink") ? 0 : holds("blue") ? 1 : 0.5;
  for (const bird of BIRDS) if (!holds(bird)) birds[bird].grounded = false;
  const ux = dx / dist;
  const uy = dy / dist;
  const excess = dist - length;
  const pull = (b: BirdState, share: number, sign: number) => {
    if (share === 0) return;
    b.x += sign * ux * excess * share;
    b.y += sign * uy * excess * share;
  };
  pull(pink, pinkShare, 1);
  pull(blue, 1 - pinkShare, -1);

  // Stop the Birds moving apart along the Rope, so a hanging Bird swings instead of stretching it.
  const separating = (blue.vx - pink.vx) * ux + (blue.vy - pink.vy) * uy;
  if (separating > 0) {
    pink.vx += ux * separating * pinkShare;
    pink.vy += uy * separating * pinkShare;
    blue.vx -= ux * separating * (1 - pinkShare);
    blue.vy -= uy * separating * (1 - pinkShare);
  }

  for (const bird of BIRDS) {
    const b = birds[bird];
    if (b.grounded) continue;
    const near = around(b.x);
    const was = before[bird];
    const floor = groundBelow(near, b.x, was.y);
    if (floor !== null && b.y < floor) {
      // Pulled down onto solid ground: it lands there.
      land(b, floor);
      continue;
    }
    if (b.y >= 0) {
      // Pulled sideways into a step or a low ceiling: it stays outside.
      const solid = solidAt(near, b.x, b.y);
      if (solid) {
        b.x = edgeFacing(solid, was.x);
        b.vx = 0;
      }
    }
    const anchor = birds[partnerOf(bird)];
    keepOutOfWalls(b, near, anchor.grounded ? anchor : undefined, length);
  }
}

/** The Course near a Bird, in Course coordinates. */
type Surroundings = Layout;

/** Far enough either side of a Bird to cover the Rope's reach and a tick's travel. */
const NEAR = 12;

/** A tiny tolerance, so a Bird resting exactly on a surface isn't inside it. */
const EPS = 1e-9;

/** The highest ground surface under `x` at or below `y`, or null over a gap. A span's ends count as ground. */
function groundBelow(near: Surroundings, x: number, y: number): number | null {
  let best: number | null = null;
  for (const g of near.ground) {
    if (x >= g.from && x <= g.to && g.height <= y + EPS && (best === null || g.height > best)) best = g.height;
  }
  return best;
}

/** The surface at `x`: the highest ground there. */
function surfaceAt(near: Surroundings, x: number): number {
  return groundBelow(near, x, Infinity) ?? 0;
}

/** The lowest ceiling over `x` at or above `head`, or null if there is none. */
function ceilingAbove(near: Surroundings, x: number, head: number): number | null {
  let best: number | null = null;
  for (const c of near.ceilings) {
    if (x > c.from && x < c.to && c.height >= head - EPS && (best === null || c.height < best)) best = c.height;
  }
  return best;
}

/** Ground or a ceiling that a Bird with its feet at `x`, `y` would be inside. */
function solidAt(near: Surroundings, x: number, y: number): Span | undefined {
  return (
    near.ground.find((g) => x > g.from && x < g.to && y < g.height - EPS) ??
    near.ceilings.find((c) => x > c.from && x < c.to && y + PHYSICS.birdHeight > c.height + EPS)
  );
}

/** The side of `solid` facing a Bird that came from `fromX`. */
function edgeFacing(solid: Span, fromX: number): number {
  if (fromX <= solid.from) return solid.from;
  if (fromX >= solid.to) return solid.to;
  return fromX - solid.from < solid.to - fromX ? solid.from : solid.to;
}

/**
 * A Bird below ground level is inside a gap, so the gap's walls hold it in. When it is held
 * against a wall by a Rope tied to `anchor` on the ground, the Rope drags it up the wall,
 * and over the lip once the Rope is too short to reach down.
 */
function keepOutOfWalls(b: BirdState, near: Surroundings, anchor?: BirdState, length = 0) {
  if (b.y >= 0) return;
  const gap = nearestGap(near, b.x);
  if (!gap) return;
  const x = Math.min(gap.end, Math.max(gap.start, b.x));
  if (x === b.x) return;
  b.x = x;
  b.vx = 0;
  if (!anchor) return;
  const reach = length * length - (anchor.x - x) ** 2;
  if (reach <= 0) {
    b.y = surfaceAt(near, x);
    b.vy = Math.max(0, b.vy);
  } else {
    b.y = Math.max(b.y, anchor.y - Math.sqrt(reach));
  }
}

/** A stretch with no ground, open from just after `start` to just before `end`. */
interface Gap {
  start: number;
  end: number;
}

/**
 * The gap nearest `x`: the stretches between the ground spans nearby. A pit's floor (ground below
 * ground level) doesn't close the gap above it: the pit's sides are its walls.
 */
function nearestGap(near: Surroundings, x: number): Gap | undefined {
  const spans = near.ground.filter((s) => s.height >= 0).sort((a, b) => a.from - b.from);
  let best: Gap | undefined;
  let bestDist = Infinity;
  let reached = -Infinity;
  for (const s of spans) {
    if (s.from > reached && reached > -Infinity) {
      const g = { start: reached, end: s.from };
      const d = x < g.start ? g.start - x : x > g.end ? x - g.end : 0;
      if (d < bestDist) (best = g), (bestDist = d);
    }
    reached = Math.max(reached, s.to);
  }
  return best;
}

function walkSpeed(thrust: number): number {
  if (thrust < PHYSICS.walkThreshold) return 0;
  const k = Math.min(1, (thrust - PHYSICS.walkThreshold) / (PHYSICS.jumpThreshold - PHYSICS.walkThreshold));
  return PHYSICS.walkSpeedMin + (PHYSICS.walkSpeedMax - PHYSICS.walkSpeedMin) * k;
}

function jumpSpeed(thrust: number): number {
  const k = (thrust - PHYSICS.jumpThreshold) / (1 - PHYSICS.jumpThreshold);
  return PHYSICS.jumpSpeedMin + (PHYSICS.jumpSpeedMax - PHYSICS.jumpSpeedMin) * k;
}
