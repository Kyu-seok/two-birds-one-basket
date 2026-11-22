/** Test doubles shared by the server's tests: drive a RoomRegistry without sockets or real timers. */
import { randomUUID } from "node:crypto";
import { COUNTDOWN_SECONDS, TICK_HZ, type ServerMessage, type StoredRun, type TeamInfo, type TopRun } from "@tbob/shared";
import { createRoomRegistry, type Connection, type Player, type Scheduler } from "./rooms.ts";
import { pairKey, type Pair, type ScoreStore } from "./scores.ts";

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

/** A ScoreStore in memory; `scores.test.ts` holds it to the same contract as the SQLite one. */
export class MemoryScores implements ScoreStore {
  teams = new Map<string, TeamInfo>();
  runs: { key: string | null; run: StoredRun }[] = [];
  teamOf(pair: Pair) {
    return this.teams.get(pairKey(pair)) ?? null;
  }
  nameTeam(pair: Pair, name: string) {
    const key = pairKey(pair);
    if (!this.teams.has(key)) this.teams.set(key, { id: randomUUID(), name });
    return this.teams.get(key)!;
  }
  saveRun(pair: Pair | null, run: StoredRun) {
    this.runs.push({ key: pair && pairKey(pair), run });
  }
  history(pair: Pair) {
    const key = pairKey(pair);
    return this.runs.filter((r) => r.key === key).map((r) => r.run);
  }
  top10() {
    const top: TopRun[] = [];
    for (const { key, run } of this.runs) {
      const team = key === null ? undefined : this.teams.get(key);
      if (team) top.push({ ...run, team });
    }
    // A stable sort keeps equal Distances in the order they were run, as SQLite's does.
    return top.sort((x, y) => y.distance - x.distance).slice(0, 10);
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
