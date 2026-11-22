export interface Point {
  x: number;
  y: number;
}

/** How quickly the camera closes on its target: the gap shrinks by e every 1/FOLLOW_RATE seconds. */
const FOLLOW_RATE = 6;
/** Further than this (m), the camera cuts rather than pans: a new Run puts the Birds back at the start. */
const CUT_DISTANCE = 15;

/** Moves the shared camera `dt` seconds of the way towards `target`, the point between the two Birds. */
export function followCamera(cam: Point, target: Point, dt: number): Point {
  if (Math.hypot(target.x - cam.x, target.y - cam.y) > CUT_DISTANCE) return { ...target };
  const k = 1 - Math.exp(-FOLLOW_RATE * dt);
  return { x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k };
}
