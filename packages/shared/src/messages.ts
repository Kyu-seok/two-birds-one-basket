import type { RopeState } from "./physics.ts";

export type Side = "left" | "right";
export const SIDES: readonly Side[] = ["left", "right"];

export type PerSide<T> = Record<Side, T>;

/** Client → server. */
export type ClientMessage =
  /** Latest Thrust for the sender's Side, 0..1. Sent ~30 times a second. */
  | { type: "thrust"; value: number }
  /** Round-trip probe; the server answers with a pong carrying the same `t`. */
  | { type: "ping"; t: number }
  /** The sender's measured round-trip time, so both players can see it. */
  | { type: "reportPing"; ms: number };

/** Server → client. */
export type ServerMessage =
  | { type: "joined"; side: Side; roomCode: string }
  | { type: "roomFull" }
  | { type: "roomNotFound" }
  | { type: "pong"; t: number }
  | {
      type: "state";
      tick: number;
      rope: RopeState;
      thrust: PerSide<number>;
      pings: PerSide<number | null>;
      present: PerSide<boolean>;
    };

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
