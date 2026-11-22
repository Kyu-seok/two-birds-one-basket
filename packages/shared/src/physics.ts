import { BIRDS, partnerOf, type Bird, type PerBird } from "./bird.ts";

/** World units are meters; y points up and the ground's surface is y = 0. A Bird's x, y is its feet. */
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
   * Both Birds have dropped below the ground's surface, so nothing can hold them up any
   * more. Only a gap goes below the surface.
   */
  fallen: boolean;
}

/** A stretch with no ground, open from just after `start` to just before `end`. */
export interface Gap {
  start: number;
  end: number;
}

export interface Course {
  /** Flat ground at y = 0 everywhere except these gaps, which have no bottom. */
  gaps: readonly Gap[];
}

/** Flat ground with one gap: too wide to walk across, so it needs a jump. */
export const TEST_COURSE: Course = { gaps: [{ start: 8, end: 9.8 }] };

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
  /** Long enough for one Bird to fall into the test gap and be rescued. */
  ropeLength: 4,
  /** How long after walking off a ledge a Bird can still jump. */
  ledgeGraceSeconds: 0.2,
  /** A climbing Bird can't pull itself closer than this to its partner. */
  ropeLengthMin: 0.5,
} as const;

function standingBird(x: number): BirdState {
  return { x, y: 0, vx: 0, vy: 0, grounded: true, airTime: 0, jumped: false };
}

export function initialWorld(): WorldState {
  return { birds: { pink: standingBird(0), blue: standingBird(1.5) }, ropeLength: PHYSICS.ropeLength, fallen: false };
}

/** Advances the world by one simulation tick. Pure: returns a new state. */
export function stepWorld(w: WorldState, thrust: Thrusts, dt: number, course: Course): WorldState {
  // A hanging Bird climbs hand over hand, at its walking pace, taking in Rope.
  let ropeLength = w.ropeLength;
  for (const bird of BIRDS) {
    if (isHanging(w, bird)) ropeLength -= walkSpeed(thrust[bird]) * dt;
  }
  ropeLength = Math.max(PHYSICS.ropeLengthMin, ropeLength);

  const birds = {
    pink: stepBird(w.birds.pink, thrust.pink, dt, course),
    blue: stepBird(w.birds.blue, thrust.blue, dt, course),
  };
  // Back on the ground, the Rope is let out again.
  if (birds.pink.grounded && birds.blue.grounded) ropeLength = PHYSICS.ropeLength;
  holdRope(birds, ropeLength, course);
  for (const bird of BIRDS) {
    if (ropeLength <= PHYSICS.ropeLengthMin) climbOverLip(birds[bird], birds[partnerOf(bird)], course);
  }
  return { birds, ropeLength, fallen: BIRDS.every((bird) => hasDropped(birds[bird])) };
}

/** A Bird is hanging when it has dropped below the ground's surface while its partner stands on it. */
function isHanging(w: WorldState, bird: Bird): boolean {
  return w.birds[bird].y < 0 && w.birds[partnerOf(bird)].grounded;
}

/** Just off a ledge, a Bird can still jump: its own voice reaches the server a round trip late (ADR 0002). */
function inLedgeGrace(b: BirdState): boolean {
  return !b.grounded && !b.jumped && b.airTime < PHYSICS.ledgeGraceSeconds;
}

/** Below the surface, sinking, and too late to jump back out: only the Rope can hold it now. */
function hasDropped(b: BirdState): boolean {
  return b.y < 0 && b.vy <= 0 && !inLedgeGrace(b);
}

/** A climber that has taken in all the Rope it can scrambles onto the lip on its partner's side. */
function climbOverLip(b: BirdState, partner: BirdState, course: Course) {
  if (b.y >= 0 || !partner.grounded) return;
  const gap = nearestGap(course, b.x);
  if (!gap) return;
  land(b);
  b.x = partner.x <= gap.start ? gap.start : gap.end;
  b.vx = 0;
}

function land(b: BirdState) {
  b.y = 0;
  b.vy = 0;
  b.grounded = true;
  b.jumped = false;
  b.airTime = 0;
}

function stepBird(b: BirdState, thrust: number, dt: number, course: Course): BirdState {
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
  const next: BirdState = { ...b, x: b.x + vx * dt, y: b.y + vy * dt, vx, vy, grounded: false, jumped };
  next.airTime = airTime + dt;
  if (next.y <= 0 && b.y >= 0 && onGround(course, next.x)) land(next);
  keepOutOfWalls(next, course);
  return next;
}

/** Pulls the Birds back within the Rope's length. Mutates the freshly stepped Birds. */
function holdRope(birds: PerBird<BirdState>, length: number, course: Course) {
  const { pink, blue } = birds;
  const dx = blue.x - pink.x;
  const dy = blue.y - pink.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= length) return;

  if (pink.grounded && blue.grounded) {
    // On the ground the Rope stops the Bird in front; it never drags the one behind.
    const [behind, front] = pink.x <= blue.x ? [pink, blue] : [blue, pink];
    front.x = behind.x + length;
    front.vx = Math.min(front.vx, behind.vx);
    return;
  }

  // Off the ground it is a real rope. A Bird standing on the ground holds firm; Birds in the
  // air share the pull equally.
  const yBefore = { pink: pink.y, blue: blue.y };
  const pinkShare = pink.grounded ? 0 : blue.grounded ? 1 : 0.5;
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
    if (b.y < 0 && yBefore[bird] >= 0 && onGround(course, b.x)) {
      // Pulled down onto solid ground: it lands there.
      land(b);
      continue;
    }
    const anchor = birds[partnerOf(bird)];
    keepOutOfWalls(b, course, anchor.grounded ? anchor : undefined, length);
  }
}

/** Whether there is ground under `x`. */
function onGround(course: Course, x: number): boolean {
  return !course.gaps.some((g) => x > g.start && x < g.end);
}

/**
 * A Bird below the surface is inside a gap, so the gap's walls hold it in. When it is held
 * against a wall by a Rope tied to `anchor` on the ground, the Rope drags it up the wall,
 * and over the lip once the Rope is too short to reach down.
 */
function keepOutOfWalls(b: BirdState, course: Course, anchor?: BirdState, length = 0) {
  if (b.y >= 0) return;
  const gap = nearestGap(course, b.x);
  if (!gap) return;
  const x = Math.min(gap.end, Math.max(gap.start, b.x));
  if (x === b.x) return;
  b.x = x;
  b.vx = 0;
  if (!anchor) return;
  const reach = length * length - (anchor.x - x) ** 2;
  if (reach <= 0) {
    b.y = 0;
    b.vy = Math.max(0, b.vy);
  } else {
    b.y = Math.max(b.y, anchor.y - Math.sqrt(reach));
  }
}

function nearestGap(course: Course, x: number): Gap | undefined {
  let best: Gap | undefined;
  let bestDist = Infinity;
  for (const g of course.gaps) {
    const d = x < g.start ? g.start - x : x > g.end ? x - g.end : 0;
    if (d < bestDist) (best = g), (bestDist = d);
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
