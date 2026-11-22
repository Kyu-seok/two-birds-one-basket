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
 * Each Run has its own random Course, built from its `course` (see `runCourse`), picked when
 * its countdown starts. Both clients rebuild the same Course from it.
 */
export type RunState =
  | { phase: "waiting"; ready: PerBird<boolean> }
  | { phase: "countdown"; course: RunCourse; secondsLeft: number }
  | { phase: "running"; course: RunCourse; distance: number }
  | { phase: "paused"; course: RunCourse; distance: number; dropped: Bird; secondsLeft: number }
  | ({ phase: "ended"; course: RunCourse; distance: number; ready: PerBird<boolean> } & RunEnd);

/** How an ended Run finished; an Abandoned one records whose player left. */
export type RunEnd = { end: "fallen" } | { end: "abandoned"; dropped: Bird };

/** What a Run's Course is built from: its seed, and whether it starts with the Opening. */
export interface RunCourse {
  seed: number;
  opening: boolean;
}

export const COUNTDOWN_SECONDS = 3;
/** How long a dropped player has to reopen the link before the Run is Abandoned. */
export const RECONNECT_SECONDS = 30;

const NOBODY_READY: PerBird<boolean> = { pink: false, blue: false };

/**
 * A countdown's seconds left as players see it: 3, 2, 1, then 0 when it is up. A little slack
 * keeps float error in the tick length from costing a whole extra tick.
 */
export function wholeSecondsLeft(secondsLeft: number): number {
  return Math.ceil(secondsLeft - 1e-6);
}

/** A Room before its first Run: nobody Ready yet. */
export function newRoomRun(): RunState {
  return { phase: "waiting", ready: { ...NOBODY_READY } };
}

type InPhase<P extends RunState["phase"]> = Extract<RunState, { phase: P }>;

/** Between Runs: before the first one, or on the Run End screen, where players press Ready or Again. */
export function isBetweenRuns(run: RunState): run is InPhase<"waiting" | "ended"> {
  return run.phase === "waiting" || run.phase === "ended";
}

/** A Run is under way: counting down, running, or paused for a dropped player. */
export function isUnderway(run: RunState): run is InPhase<"countdown" | "running" | "paused"> {
  return !isBetweenRuns(run);
}

/** Whether `bird`'s player is Ready (before the first Run) or has pressed Again (on the Run End screen). */
export function isReady(run: RunState, bird: Bird): boolean {
  return isBetweenRuns(run) && run.ready[bird];
}

/** A player presses (or takes back) Ready, or Again on the Run End screen. Ignored during a Run. */
export function setReady(run: RunState, bird: Bird, value: boolean): RunState {
  if (!isBetweenRuns(run)) return run;
  return { ...run, ready: { ...run.ready, [bird]: value } };
}

/**
 * A player left: they are no longer Ready, a countdown they were part of stops, and a running
 * Run pauses until they come back (or RECONNECT_SECONDS pass). A player who `canReturn` not at
 * all (nobody can be recognised as them) ends a Run under way as Abandoned at once.
 */
export function playerLeft(run: RunState, bird: Bird, canReturn = true): RunState {
  if (run.phase === "countdown") return newRoomRun();
  if (run.phase === "running" || run.phase === "paused") {
    const { course, distance } = run;
    if (!canReturn) return { phase: "ended", course, end: "abandoned", dropped: bird, distance, ready: { ...NOBODY_READY } };
    if (run.phase === "running") return { phase: "paused", course, distance, dropped: bird, secondsLeft: RECONNECT_SECONDS };
    return run;
  }
  return setReady(run, bird, false);
}

/** A player came back to their Bird: a Run paused for them resumes where it stopped. */
export function playerReturned(run: RunState, bird: Bird): RunState {
  if (run.phase === "paused" && run.dropped === bird) return { phase: "running", course: run.course, distance: run.distance };
  return run;
}

/**
 * How far the Bird behind is along `course`, in meters, counted from where its random Pieces
 * begin: the start and the Opening are 0 m.
 */
export function distanceOf(world: WorldState, course: Course): number {
  return Math.max(0, Math.min(world.birds.pink.x, world.birds.blue.x) - course.distanceFrom);
}

/** Before a Room's first Run there is no Course yet: just the start. */
const START_ONLY = fixedCourse([{ x: -30, piece: START_PIECE }]);

/** Builds a Run's Course from its seed, with or without the Opening. */
export type CourseOf = (seed: number, opening: boolean) => Course;

/** The Course a Run is on, the same on the server and both clients. */
export function runCourse(run: RunState, courseOf: CourseOf = courseForSeed): Course {
  return "course" in run ? courseOf(run.course.seed, run.course.opening) : START_ONLY;
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
        { phase: "countdown", course: nextCourse(), secondsLeft: COUNTDOWN_SECONDS },
        initialWorld(),
        thrust,
        dt,
        nextCourse,
        courseOf,
      );
    case "countdown": {
      const { course } = run;
      const secondsLeft = run.secondsLeft - dt;
      if (wholeSecondsLeft(secondsLeft) <= 0) return { run: { phase: "running", course, distance: 0 }, world };
      return { run: { phase: "countdown", course, secondsLeft }, world };
    }
    case "running": {
      const { course } = run;
      const built = courseOf(course.seed, course.opening);
      const next = stepWorld(world, thrust, dt, built);
      const distance = Math.max(run.distance, distanceOf(next, built));
      if (next.fallen) {
        return { run: { phase: "ended", course, end: "fallen", distance, ready: { ...NOBODY_READY } }, world: next };
      }
      return { run: { phase: "running", course, distance }, world: next };
    }
    case "paused": {
      const { course, distance, dropped } = run;
      const secondsLeft = run.secondsLeft - dt;
      if (wholeSecondsLeft(secondsLeft) <= 0) {
        return { run: { phase: "ended", course, end: "abandoned", dropped, distance, ready: { ...NOBODY_READY } }, world };
      }
      return { run: { ...run, secondsLeft }, world };
    }
  }
}
