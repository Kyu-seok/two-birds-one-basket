import type { Bird, PerBird } from "./bird.ts";
import type { WorldState } from "./physics.ts";
import type { RunState } from "./run.ts";
import type { VoiceSignal } from "./voice.ts";

/** Client → server. */
export type ClientMessage =
  /** Latest Thrust for the sender's Bird, 0..1. Sent ~30 times a second. */
  | { type: "thrust"; value: number }
  /** Round-trip probe; the server answers with a pong carrying the same `t`. */
  | { type: "ping"; t: number }
  /** The sender's measured round-trip time, so both players can see it. */
  | { type: "reportPing"; ms: number }
  /** Whether the sender has a Calibration. False while they redo it; only a calibrated player can become Ready. */
  | { type: "calibrated"; value: boolean }
  /** A Room chat message: the silent way to coordinate (ADR 0001). */
  | { type: "chat"; text: string }
  /** Press (or take back) Ready before a Run, or Again on the Run End screen. Only counts once calibrated. */
  | { type: "ready"; value: boolean }
  /** Voice chat setup for the partner's browser; the server passes it on. */
  | { type: "signal"; signal: VoiceSignal };

/** Server → client. */
export type ServerMessage =
  | { type: "joined"; bird: Bird; roomCode: string }
  | { type: "roomFull" }
  | { type: "roomNotFound" }
  | { type: "pong"; t: number }
  /** A Room chat message from `bird`, sent to both players. */
  | { type: "chat"; bird: Bird; text: string }
  /** Voice chat setup from the partner's browser. */
  | { type: "signal"; signal: VoiceSignal }
  | {
      type: "state";
      tick: number;
      world: WorldState;
      thrust: PerBird<number>;
      pings: PerBird<number | null>;
      present: PerBird<boolean>;
      /** Which players have calibrated. */
      calibrated: PerBird<boolean>;
      /** Where the Room is in its Runs: waiting, countdown, running (with live Distance) or ended. */
      run: RunState;
    };

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
