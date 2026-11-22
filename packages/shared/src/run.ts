import type { Bird, PerBird } from "./bird.ts";
import { initialWorld, stepWorld, type Course, type Thrusts, type WorldState } from "./physics.ts";

/** How a Run finished. #12 adds "abandoned". */
export type RunEndReason = "fallen";

/**
 * Where a Room is in its cycle of Runs:
 *
 *   waiting ──both Ready──▶ countdown ──3 s──▶ running ──Fallen──▶ ended ──both Again──▶ countdown …
 *
 * `waiting` is before a Room's first Run; `ended` is the Run End screen, where "Again" is the
 * same Ready press. The world only moves while `running`.
 */
export type RunState =
  | { phase: "waiting"; ready: PerBird<boolean> }
  | { phase: "countdown"; secondsLeft: number }
  | { phase: "running"; distance: number }
  | { phase: "ended"; end: RunEndReason; distance: number; ready: PerBird<boolean> };

export const COUNTDOWN_SECONDS = 3;

const NOBODY_READY: PerBird<boolean> = { pink: false, blue: false };

/** A Room before its first Run: nobody Ready yet. */
export function newRoomRun(): RunState {
  return { phase: "waiting", ready: { ...NOBODY_READY } };
}

/** Whether `bird`'s player is Ready (before the first Run) or has pressed Again (on the Run End screen). */
export function isReady(run: RunState, bird: Bird): boolean {
  return "ready" in run && run.ready[bird];
}

/** A player presses (or takes back) Ready, or Again on the Run End screen. Ignored during a Run. */
export function setReady(run: RunState, bird: Bird, value: boolean): RunState {
  if (!("ready" in run)) return run;
  return { ...run, ready: { ...run.ready, [bird]: value } };
}

/** A player left: they are no longer Ready, and a countdown they were part of stops. A running Run carries on (#12 ends it as Abandoned). */
export function playerLeft(run: RunState, bird: Bird): RunState {
  if (run.phase === "countdown") return newRoomRun();
  return setReady(run, bird, false);
}

/** How far the Bird behind is along the Course, in meters. */
export function distanceOf(world: WorldState): number {
  return Math.max(0, Math.min(world.birds.pink.x, world.birds.blue.x));
}

/** Advances the Run, and the world within it, by one tick. Pure. */
export function stepRun(
  run: RunState,
  world: WorldState,
  thrust: Thrusts,
  dt: number,
  course: Course,
): { run: RunState; world: WorldState } {
  switch (run.phase) {
    case "waiting":
    case "ended":
      if (!(run.ready.pink && run.ready.blue)) return { run, world };
      // The countdown's first tick is this one, with both Birds back at the start.
      return stepRun({ phase: "countdown", secondsLeft: COUNTDOWN_SECONDS }, initialWorld(), thrust, dt, course);
    case "countdown": {
      const secondsLeft = run.secondsLeft - dt;
      // A little slack so float error in dt doesn't cost a whole extra tick.
      if (secondsLeft <= 1e-6) return { run: { phase: "running", distance: 0 }, world };
      return { run: { phase: "countdown", secondsLeft }, world };
    }
    case "running": {
      const next = stepWorld(world, thrust, dt, course);
      const distance = Math.max(run.distance, distanceOf(next));
      if (next.fallen) {
        return { run: { phase: "ended", end: "fallen", distance, ready: { ...NOBODY_READY } }, world: next };
      }
      return { run: { phase: "running", distance }, world: next };
    }
  }
}
