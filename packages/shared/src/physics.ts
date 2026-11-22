/** World units are meters; y points up. */
export interface BasketState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians; positive = tilted clockwise (Right Side lower). */
  angle: number;
  angularVelocity: number;
}

/** Each Side's Thrust, 0..1. */
export interface Thrusts {
  left: number;
  right: number;
}

export const PHYSICS = {
  gravity: 9.8,
  /** Acceleration from one Bird at full Thrust. Two Birds at full Thrust beat gravity. */
  birdLift: 8,
  /** Angular acceleration (rad/s²) per unit of Thrust difference between the Sides. */
  tiltTorque: 4,
  /** Pulls the Basket back toward upright, so a steady imbalance settles at a steady tilt. */
  uprightStiffness: 3,
  /** Per-second damping rates; high values make the Basket heavy and floaty. */
  linearDamping: 0.8,
  angularDamping: 2.5,
  maxTilt: Math.PI / 4,
  /** The floor of the empty test Course. */
  groundY: 0,
} as const;

export function initialBasket(): BasketState {
  return { x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
}

/** Advances the Basket by one simulation tick. Pure: returns a new state. */
export function stepBasket(s: BasketState, thrust: Thrusts, dt: number): BasketState {
  const torque =
    PHYSICS.tiltTorque * (thrust.left - thrust.right) -
    PHYSICS.uprightStiffness * s.angle -
    PHYSICS.angularDamping * s.angularVelocity;
  const angularVelocity = s.angularVelocity + torque * dt;
  const angle = clamp(s.angle + angularVelocity * dt, -PHYSICS.maxTilt, PHYSICS.maxTilt);

  // The Birds push along the Basket's tilted "up", so a tilt to the right drifts it right.
  const lift = PHYSICS.birdLift * (thrust.left + thrust.right);
  const ax = lift * Math.sin(angle) - PHYSICS.linearDamping * s.vx;
  const ay = lift * Math.cos(angle) - PHYSICS.gravity - PHYSICS.linearDamping * s.vy;
  const vx = s.vx + ax * dt;
  let vy = s.vy + ay * dt;
  let y = s.y + vy * dt;
  if (y <= PHYSICS.groundY) {
    y = PHYSICS.groundY;
    vy = Math.max(0, vy);
  }

  return { x: s.x + vx * dt, y, vx, vy, angle, angularVelocity };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
