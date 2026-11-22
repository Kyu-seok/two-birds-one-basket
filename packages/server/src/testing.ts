/** Test doubles shared by the server's tests: drive a RoomRegistry without sockets or real timers. */
import { COUNTDOWN_SECONDS, TICK_HZ, courseOf, type ServerMessage } from "@tbob/shared";
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

/** Every Run in the tests is on flat ground with one gap, from 8 m to 9.8 m. */
const TEST_GAP = { start: 8, end: 9.8 };
const TEST_COURSE = courseOf([
  { from: -100, to: TEST_GAP.start, height: 0 },
  { from: TEST_GAP.end, to: 200, height: 0 },
]);

export function setup() {
  const scheduler = new FakeScheduler();
  // Each tick offers the next seed, so each Run's seed differs.
  let seed = 0;
  const rooms = createRoomRegistry({ scheduler, makeSeed: () => ++seed, courseOf: () => TEST_COURSE });
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
