import { describe, expect, it } from "vitest";
import { RECONNECT_SECONDS, TICK_HZ } from "@tbob/shared";
import { FakeConnection, runningRoom, setup } from "./testing.ts";

const ANN = "browser-ann";
const BO = "browser-bo";

/** A Run under way between Ann (pink) and Bo (blue), both walking for a second. */
function walking() {
  const room = runningRoom({ pink: ANN, blue: BO });
  room.pink.receive({ type: "thrust", value: 0.4 });
  room.blue.receive({ type: "thrust", value: 0.4 });
  room.scheduler.fire(TICK_HZ);
  return room;
}

describe("a player dropping mid-Run", () => {
  it("pauses the Run for both Birds and shows the remaining player who dropped and the countdown", () => {
    const { scheduler, a, blue } = walking();
    const before = a.last("state")!;

    blue.disconnect();
    scheduler.fire(TICK_HZ * 10);

    const now = a.last("state")!;
    expect(now.world.birds).toEqual(before.world.birds);
    expect(now.present).toEqual({ pink: true, blue: false });
    expect(now.run).toMatchObject({ phase: "paused", dropped: "blue" });
    expect(now.run.phase === "paused" && Math.ceil(now.run.secondsLeft)).toBe(RECONNECT_SECONDS - 10);
  });

  it("gives the same browser its Bird and Calibration back within 30 s, and the Run resumes", () => {
    const { scheduler, rooms, code, a, blue } = walking();
    const distance = a.last("state")!.run;
    blue.disconnect();
    scheduler.fire(TICK_HZ * 20);

    const b2 = new FakeConnection();
    const back = rooms.connect(code, b2, BO)!;
    back.receive({ type: "thrust", value: 0.4 });
    scheduler.fire(TICK_HZ);

    expect(b2.last("joined")?.bird).toBe("blue");
    const state = a.last("state")!;
    expect(state.present).toEqual({ pink: true, blue: true });
    expect(state.calibrated).toEqual({ pink: true, blue: true });
    expect(state.run.phase).toBe("running");
    expect(state.run.phase === "running" && state.run.distance).toBeGreaterThan(
      distance.phase === "running" ? distance.distance : Infinity,
    );
  });

  it("keeps the dropped Bird for its browser: someone else can't take it", () => {
    const { rooms, code, blue } = walking();
    blue.disconnect();

    const stranger = new FakeConnection();
    expect(rooms.connect(code, stranger, "browser-cy")).toBeNull();
    expect(stranger.messages).toEqual([{ type: "roomFull" }]);
  });

  it("ends the Run as Abandoned with its Distance after 30 s, and records it", () => {
    const { scheduler, scores, a, blue } = walking();
    const running = a.last("state")!.run;
    const distance = running.phase === "running" ? running.distance : -1;

    blue.disconnect();
    scheduler.fire(TICK_HZ * RECONNECT_SECONDS);

    expect(a.last("state")!.run).toMatchObject({ phase: "ended", end: "abandoned", distance, ready: { pink: false, blue: false } });
    expect(scores.runs).toHaveLength(1);
    expect(scores.runs[0]!.run).toMatchObject({ end: "abandoned", distance });
    // The pause doesn't count toward how long the Run lasted.
    expect(scores.runs[0]!.run.seconds).toBeCloseTo(1, 1);
  });

  it("records the Run as Abandoned if the remaining player leaves too", () => {
    const { scores, pink, blue } = walking();
    blue.disconnect();
    pink.disconnect();

    expect(scores.runs.map((r) => r.run.end)).toEqual(["abandoned"]);
  });
});

describe("a player dropping outside a Run", () => {
  it("keeps their Bird and Calibration for when the same browser comes back", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const a = new FakeConnection();
    rooms.connect(code, a, ANN);
    const blue = rooms.connect(code, new FakeConnection(), BO)!;
    blue.receive({ type: "calibrated", value: true });
    blue.receive({ type: "ready", value: true });

    blue.disconnect();
    const stranger = new FakeConnection();
    expect(rooms.connect(code, stranger, "browser-cy")).toBeNull();

    const b2 = new FakeConnection();
    rooms.connect(code, b2, BO);
    scheduler.fire();

    expect(b2.last("joined")?.bird).toBe("blue");
    const state = a.last("state")!;
    expect(state.calibrated.blue).toBe(true);
    // Leaving still takes back Ready.
    expect(state.run).toEqual({ phase: "waiting", ready: { pink: false, blue: false } });
  });

  it("frees their Bird for someone else after 30 s", () => {
    const { rooms, scheduler } = setup();
    const code = rooms.createRoom();
    const a = new FakeConnection();
    rooms.connect(code, a, ANN);
    const blue = rooms.connect(code, new FakeConnection(), BO)!;
    blue.receive({ type: "calibrated", value: true });

    blue.disconnect();
    scheduler.fire(TICK_HZ * RECONNECT_SECONDS);

    const c = new FakeConnection();
    rooms.connect(code, c, "browser-cy");
    scheduler.fire();
    expect(c.last("joined")?.bird).toBe("blue");
    expect(a.last("state")!.calibrated.blue).toBe(false);
  });
});
