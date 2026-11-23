/** Helpers shared by the shared package's tests. */
import type { Course } from "./course.ts";
import { TICK_HZ } from "./messages.ts";
import { initialWorld, stepWorld, type WorldState } from "./physics.ts";

const TICK = 1 / TICK_HZ;

/**
 * Whether a Bird hanging alone in the gap from `edge` to `far`, its partner anchoring on the near
 * side, ever gets onto the far side by swinging and climbing, however it tries.
 */
export function loneBirdCrosses(course: Course, edge: number, far: number): boolean {
  for (const anchor of [edge - 0.05, edge - 0.4, edge - 1.5]) {
    for (const swing of [0.6, 0.75, 0.9, 1]) {
      for (const climb of [0, 0.2, 0.5]) {
        const w = initialWorld();
        let s: WorldState = { ...w, birds: { pink: { ...w.birds.pink, x: anchor }, blue: { ...w.birds.blue, x: edge - 0.05 } } };
        let hung = false;
        for (let i = 0; i < 12 * TICK_HZ; i++) {
          const blue = s.birds.blue;
          hung ||= blue.y < -1;
          // Blue walks off the edge; once hanging, it swings while it is moving forward and
          // climbs (or rests) otherwise. Pink stays put.
          const t = !hung ? 0.3 : blue.vx >= 0 ? swing : climb;
          s = stepWorld(s, { pink: 0, blue: t }, TICK, course);
          if (s.birds.blue.grounded && s.birds.blue.x >= far) return true;
        }
      }
    }
  }
  return false;
}
