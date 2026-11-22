import type { Bird, PerBird } from "./bird.ts";
import { initialWorld, stepWorld, type Course, type Thrusts, type WorldState } from "./physics.ts";

/** How a Run finished: Fallen, or Abandoned when a player dropped and didn't come back in time. */
export type RunEndReason = "fallen" | "abandoned";

/**
 * Where a Room is in its cycle of Runs:
 *
 *   waiting ──both Ready──▶ countdown ──3 s──▶ running ──Fallen──▶ ended ──both Again──▶ countdown …
 *                                              │    ▲
 *                                   a player drops  they return within 30 s
 *                                              ▼    │
 *                                              paused ──30 s──▶ ended (Abandoned)
 *
 * `waiting` is before a Room's first Run; `ended` is the Run End screen, where "Again" is the
 * same Ready press. The world only moves while `running`; `paused` freezes it with the Run's
 * Distance kept.
 */
export type RunState =
  | { phase: "waiting"; ready: PerBird<boolean> }
  | { phase: "countdown"; secondsLeft: number }
  | { phase: "running"; distance: number }
  | { phase: "paused"; distance: number; dropped: Bird; secondsLeft: number }
  | { phase: "ended"; end: RunEndReason; distance: number; ready: PerBird<boolean> };

export const COUNTDOWN_SECONDS = 3;
/** How long a dropped player has to reopen the link before the Run is Abandoned. */
export const RECONNECT_SECONDS = 30;

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

/**
 * A player left: they are no longer Ready, a countdown they were part of stops, and a running
 * Run pauses until they come back (or RECONNECT_SECONDS pass).
 */
export function playerLeft(run: RunState, bird: Bird): RunState {
  if (run.phase === "countdown") return newRoomRun();
  if (run.phase === "running") {
    return { phase: "paused", distance: run.distance, dropped: bird, secondsLeft: RECONNECT_SECONDS };
  }
  return setReady(run, bird, false);
}

/** A player came back to their Bird: a Run paused for them resumes where it stopped. */
export function playerReturned(run: RunState, bird: Bird): RunState {
  if (run.phase === "paused" && run.dropped === bird) return { phase: "running", distance: run.distance };
  return run;
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
    case "paused": {
      const secondsLeft = run.secondsLeft - dt;
      if (secondsLeft <= 1e-6) {
        return { run: { phase: "ended", end: "abandoned", distance: run.distance, ready: { ...NOBODY_READY } }, world };
      }
      return { run: { ...run, secondsLeft }, world };
    }
  }
}
