import type { Bird, PerBird } from "./bird.ts";
import { START_PIECE, courseForSeed, fixedCourse, type Course } from "./course.ts";
import { initialWorld, stepWorld, type Thrusts, type WorldState } from "./physics.ts";

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
 *
 * Each Run has its own random Course, built from `seed` and starting with the Opening if
 * `opening` (see `runCourse`), picked when its countdown starts. Both clients rebuild the same
 * Course from them.
 */
export type RunState =
  | { phase: "waiting"; ready: PerBird<boolean> }
  | ({ phase: "countdown"; secondsLeft: number } & RunCourse)
  | ({ phase: "running"; distance: number } & RunCourse)
  | ({ phase: "paused"; distance: number; dropped: Bird; secondsLeft: number } & RunCourse)
  | ({ phase: "ended"; end: RunEndReason; distance: number; ready: PerBird<boolean> } & RunCourse);

/** What a Run's Course is built from: its seed, and whether it starts with the Opening. */
export interface RunCourse {
  seed: number;
  opening: boolean;
}

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
    return { phase: "paused", seed: run.seed, opening: run.opening, distance: run.distance, dropped: bird, secondsLeft: RECONNECT_SECONDS };
  }
  return setReady(run, bird, false);
}

/** A player came back to their Bird: a Run paused for them resumes where it stopped. */
export function playerReturned(run: RunState, bird: Bird): RunState {
  if (run.phase === "paused" && run.dropped === bird) return { phase: "running", seed: run.seed, opening: run.opening, distance: run.distance };
  return run;
}

/** How far the Bird behind is along the Course, in meters. */
export function distanceOf(world: WorldState): number {
  return Math.max(0, Math.min(world.birds.pink.x, world.birds.blue.x));
}

/** Before a Room's first Run there is no Course yet: just the start. */
const START_ONLY = fixedCourse([{ x: -30, piece: START_PIECE }]);

/** Builds a Run's Course from its seed, with or without the Opening. */
export type CourseOf = (seed: number, opening: boolean) => Course;

/** The Course a Run is on, the same on the server and both clients. */
export function runCourse(run: RunState, courseOf: CourseOf = courseForSeed): Course {
  return "seed" in run ? courseOf(run.seed, run.opening) : START_ONLY;
}

/**
 * Advances the Run, and the world within it, by one tick. Pure. `nextCourse` picks the Course of
 * a Run that starts this tick (it isn't called otherwise); `courseOf` builds it.
 */
export function stepRun(
  run: RunState,
  world: WorldState,
  thrust: Thrusts,
  dt: number,
  nextCourse: () => RunCourse,
  courseOf: CourseOf = courseForSeed,
): { run: RunState; world: WorldState } {
  switch (run.phase) {
    case "waiting":
    case "ended":
      if (!(run.ready.pink && run.ready.blue)) return { run, world };
      // The countdown's first tick is this one, with both Birds back at the start of a new Course.
      return stepRun(
        { phase: "countdown", ...nextCourse(), secondsLeft: COUNTDOWN_SECONDS },
        initialWorld(),
        thrust,
        dt,
        nextCourse,
        courseOf,
      );
    case "countdown": {
      const { seed, opening } = run;
      const secondsLeft = run.secondsLeft - dt;
      // A little slack so float error in dt doesn't cost a whole extra tick.
      if (secondsLeft <= 1e-6) return { run: { phase: "running", seed, opening, distance: 0 }, world };
      return { run: { phase: "countdown", seed, opening, secondsLeft }, world };
    }
    case "running": {
      const { seed, opening } = run;
      const next = stepWorld(world, thrust, dt, courseOf(seed, opening));
      const distance = Math.max(run.distance, distanceOf(next));
      if (next.fallen) {
        return { run: { phase: "ended", seed, opening, end: "fallen", distance, ready: { ...NOBODY_READY } }, world: next };
      }
      return { run: { phase: "running", seed, opening, distance }, world: next };
    }
    case "paused": {
      const { seed, opening, distance } = run;
      const secondsLeft = run.secondsLeft - dt;
      if (secondsLeft <= 1e-6) {
        return { run: { phase: "ended", seed, opening, end: "abandoned", distance, ready: { ...NOBODY_READY } }, world };
      }
      return { run: { ...run, secondsLeft }, world };
    }
  }
}
