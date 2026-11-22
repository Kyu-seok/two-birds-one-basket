/** Test doubles shared by the server's tests: drive a RoomRegistry without sockets or real timers. */
import type { ServerMessage } from "@tbob/shared";
import { createRoomRegistry, type Connection, type Scheduler } from "./rooms.ts";

export class FakeConnection implements Connection {
  messages: ServerMessage[] = [];
  closed = false;
  send(msg: ServerMessage) {
    this.messages.push(msg);
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMessage["type"]>(type: T) {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1);
  }
}

export class FakeScheduler implements Scheduler {
  timers: { ms: number; fn: () => void; cancelled: boolean }[] = [];
  every(ms: number, fn: () => void) {
    const timer = { ms, fn, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }
  /** Fires every live timer `n` times. */
  fire(n = 1) {
    for (let i = 0; i < n; i++) for (const t of this.timers) if (!t.cancelled) t.fn();
  }
}

export function setup() {
  const scheduler = new FakeScheduler();
  const rooms = createRoomRegistry({ scheduler });
  return { scheduler, rooms };
}
