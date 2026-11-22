/** Test doubles shared by the server's tests: drive a RoomRegistry without sockets or real timers. */
import { COUNTDOWN_SECONDS, TICK_HZ, type ServerMessage } from "@tbob/shared";
import { createRoomRegistry, type Connection, type Player, type Scheduler } from "./rooms.ts";

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

/** Both players calibrate and press Ready, then the countdown runs out: the Run is on. */
export function startRun(scheduler: FakeScheduler, pink: Player, blue: Player) {
  for (const p of [pink, blue]) {
    p.receive({ type: "calibrated", value: true });
    p.receive({ type: "ready", value: true });
  }
  scheduler.fire(COUNTDOWN_SECONDS * TICK_HZ);
}

/** A Room with both players in it and a Run under way. */
export function runningRoom() {
  const { scheduler, rooms } = setup();
  const code = rooms.createRoom();
  const [a, b] = [new FakeConnection(), new FakeConnection()];
  const pink = rooms.connect(code, a)!;
  const blue = rooms.connect(code, b)!;
  startRun(scheduler, pink, blue);
  return { scheduler, rooms, code, a, b, pink, blue };
}
