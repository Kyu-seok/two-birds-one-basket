import { describe, expect, it } from "vitest";
import { initialWorld, type ServerMessage } from "@tbob/shared";
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
  it("creates a Room whose Room Code a player can join, taking the pink Bird", () => {
    const { rooms } = setup();
    const code = rooms.createRoom();
    const a = new FakeConnection();

    rooms.connect(code, a);

    expect(code).toMatch(/^[A-Z0-9]{4,}$/);
    expect(a.last("joined")).toEqual({ type: "joined", bird: "pink", roomCode: code });
  });

  it("gives the second player the blue Bird and turns a third player away", () => {
    const { rooms } = setup();
    const code = rooms.createRoom();
    const [a, b, c] = [new FakeConnection(), new FakeConnection(), new FakeConnection()];

    rooms.connect(code, a);
    rooms.connect(code, b);
    const third = rooms.connect(code, c);

    expect(a.last("joined")?.bird).toBe("pink");
    expect(b.last("joined")?.bird).toBe("blue");
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

  it("simulates the world at 30 Hz from both players' Thrust and sends both the same state", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    const pink = rooms.connect(code, a)!;
    const blue = rooms.connect(code, b)!;

    pink.receive({ type: "thrust", value: 0.4 });
    blue.receive({ type: "thrust", value: 0.4 });
    scheduler.fire(30);

    expect(scheduler.timers.map((t) => t.ms)).toEqual([1000 / 30]);
    const stateA = a.last("state")!;
    expect(stateA.tick).toBe(30);
    expect(stateA.world.birds.pink.x).toBeGreaterThan(initialWorld().birds.pink.x + 1);
    expect(stateA.world.birds.blue.x).toBeGreaterThan(initialWorld().birds.blue.x + 1);
    expect(stateA.thrust).toEqual({ pink: 0.4, blue: 0.4 });
    expect(b.last("state")).toEqual(stateA);
  });

  it("moves only the Bird whose player is giving Thrust", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    rooms.connect(code, a);
    rooms.connect(code, b)!.receive({ type: "thrust", value: 0.4 });

    scheduler.fire(15);

    const { pink, blue } = a.last("state")!.world.birds;
    expect(pink.x).toBe(initialWorld().birds.pink.x);
    expect(blue.x).toBeGreaterThan(initialWorld().birds.blue.x);
  });

  it("resets the test Course and tells both players when both Birds have Fallen", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    const pink = rooms.connect(code, a)!;
    const blue = rooms.connect(code, b)!;

    // Both walk steadily forward, straight into the gap.
    pink.receive({ type: "thrust", value: 0.4 });
    blue.receive({ type: "thrust", value: 0.4 });
    scheduler.fire(30 * 10);

    for (const conn of [a, b]) {
      const fallenAt = conn.messages.findIndex((m) => m.type === "fallen");
      expect(fallenAt).toBeGreaterThan(0);
      const next = conn.messages[fallenAt + 1];
      expect(next?.type === "state" && next.world).toEqual(initialWorld());
    }
  });

  it("answers a ping with a pong and shows both players' reported pings to both", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    const pink = rooms.connect(code, a)!;
    const blue = rooms.connect(code, b)!;

    pink.receive({ type: "ping", t: 123 });
    pink.receive({ type: "reportPing", ms: 5 });
    blue.receive({ type: "reportPing", ms: 80 });
    scheduler.fire();

    expect(a.last("pong")).toEqual({ type: "pong", t: 123 });
    expect(b.last("pong")).toBeUndefined();
    expect(a.last("state")!.pings).toEqual({ pink: 5, blue: 80 });
    expect(b.last("state")!.pings).toEqual({ pink: 5, blue: 80 });
  });

  it("clamps Thrust from a client into 0..1", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const pink = rooms.connect(code, new FakeConnection())!;
    const b = new FakeConnection();
    const blue = rooms.connect(code, b)!;

    pink.receive({ type: "thrust", value: 50 });
    blue.receive({ type: "thrust", value: Number.NaN });
    scheduler.fire();

    expect(b.last("state")!.thrust).toEqual({ pink: 1, blue: 0 });
  });

  it("frees a Bird when its player leaves, so someone can take it again", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const [a, b, c] = [new FakeConnection(), new FakeConnection(), new FakeConnection()];
    const pink = rooms.connect(code, a)!;
    rooms.connect(code, b);
    pink.receive({ type: "thrust", value: 1 });

    pink.disconnect();
    scheduler.fire();
    expect(b.last("state")!.present).toEqual({ pink: false, blue: true });
    expect(b.last("state")!.thrust.pink).toBe(0);

    rooms.connect(code, c);
    expect(c.last("joined")?.bird).toBe("pink");
  });

  it("ends the Room when both players have left", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const pink = rooms.connect(code, new FakeConnection())!;
    const blue = rooms.connect(code, new FakeConnection())!;

    pink.disconnect();
    blue.disconnect();

    expect(scheduler.timers.every((t) => t.cancelled)).toBe(true);
    const late = new FakeConnection();
    expect(rooms.connect(code, late)).toBeNull();
    expect(late.messages).toEqual([{ type: "roomNotFound" }]);
  });
});
