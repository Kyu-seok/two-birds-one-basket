import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tbob/shared";
import { createRoomRegistry, type Connection, type Scheduler } from "./rooms.ts";

class FakeConnection implements Connection {
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

class FakeScheduler implements Scheduler {
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

function setup() {
  const scheduler = new FakeScheduler();
  const rooms = createRoomRegistry({ scheduler });
  return { scheduler, rooms };
}

describe("RoomRegistry", () => {
  it("creates a Room whose Room Code a player can join, taking a Side", () => {
    const { rooms } = setup();
    const code = rooms.createRoom();
    const a = new FakeConnection();

    rooms.connect(code, a);

    expect(code).toMatch(/^[A-Z0-9]{4,}$/);
    expect(a.last("joined")).toEqual({ type: "joined", side: "left", roomCode: code });
  });

  it("gives the second player the other Side and turns a third player away", () => {
    const { rooms } = setup();
    const code = rooms.createRoom();
    const [a, b, c] = [new FakeConnection(), new FakeConnection(), new FakeConnection()];

    rooms.connect(code, a);
    rooms.connect(code, b);
    const third = rooms.connect(code, c);

    expect(a.last("joined")?.side).toBe("left");
    expect(b.last("joined")?.side).toBe("right");
    expect(third).toBeNull();
    expect(c.messages).toEqual([{ type: "roomFull" }]);
    expect(c.closed).toBe(true);
  });

  it("rejects a Room Code that does not exist", () => {
    const { rooms } = setup();
    const a = new FakeConnection();

    expect(rooms.connect("NOPE1", a)).toBeNull();
    expect(a.messages).toEqual([{ type: "roomNotFound" }]);
    expect(a.closed).toBe(true);
  });

  it("simulates the Basket at 30 Hz from both players' Thrust and sends both the same state", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    const left = rooms.connect(code, a)!;
    const right = rooms.connect(code, b)!;

    left.receive({ type: "thrust", value: 1 });
    right.receive({ type: "thrust", value: 1 });
    scheduler.fire(60);

    expect(scheduler.timers.map((t) => t.ms)).toEqual([1000 / 30]);
    const stateA = a.last("state")!;
    expect(stateA.tick).toBe(60);
    expect(stateA.basket.y).toBeGreaterThan(1);
    expect(stateA.thrust).toEqual({ left: 1, right: 1 });
    expect(b.last("state")).toEqual(stateA);
  });

  it("lifts only the Side whose player is giving Thrust, tilting the Basket away from it", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    rooms.connect(code, a)!.receive({ type: "thrust", value: 1 });
    rooms.connect(code, b);

    scheduler.fire(15);

    expect(a.last("state")!.basket.angle).toBeGreaterThan(0);
  });

  it("answers a ping with a pong and shows both players' reported pings to both", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    const left = rooms.connect(code, a)!;
    const right = rooms.connect(code, b)!;

    left.receive({ type: "ping", t: 123 });
    left.receive({ type: "reportPing", ms: 5 });
    right.receive({ type: "reportPing", ms: 80 });
    scheduler.fire();

    expect(a.last("pong")).toEqual({ type: "pong", t: 123 });
    expect(b.last("pong")).toBeUndefined();
    expect(a.last("state")!.pings).toEqual({ left: 5, right: 80 });
    expect(b.last("state")!.pings).toEqual({ left: 5, right: 80 });
  });

  it("clamps Thrust from a client into 0..1", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const left = rooms.connect(code, new FakeConnection())!;
    const b = new FakeConnection();
    const right = rooms.connect(code, b)!;

    left.receive({ type: "thrust", value: 50 });
    right.receive({ type: "thrust", value: Number.NaN });
    scheduler.fire();

    expect(b.last("state")!.thrust).toEqual({ left: 1, right: 0 });
  });

  it("frees a Side when its player leaves, so someone can take it again", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b, c] = [new FakeConnection(), new FakeConnection(), new FakeConnection()];
    const left = rooms.connect(code, a)!;
    rooms.connect(code, b);
    left.receive({ type: "thrust", value: 1 });

    left.disconnect();
    scheduler.fire();
    expect(b.last("state")!.present).toEqual({ left: false, right: true });
    expect(b.last("state")!.thrust.left).toBe(0);

    rooms.connect(code, c);
    expect(c.last("joined")?.side).toBe("left");
  });

  it("ends the Room when both players have left", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const left = rooms.connect(code, new FakeConnection())!;
    const right = rooms.connect(code, new FakeConnection())!;

    left.disconnect();
    right.disconnect();

    expect(scheduler.timers.every((t) => t.cancelled)).toBe(true);
    const late = new FakeConnection();
    expect(rooms.connect(code, late)).toBeNull();
    expect(late.messages).toEqual([{ type: "roomNotFound" }]);
  });
});
