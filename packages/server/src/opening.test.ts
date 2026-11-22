import { describe, expect, it } from "vitest";
import { FakeConnection, setup, startRun, type FakeScheduler } from "./testing.ts";
import type { Player, RoomRegistry } from "./rooms.ts";

const ANN = "browser-ann";
const BO = "browser-bo";

function room(rooms: RoomRegistry, first?: string, second?: string) {
  const code = rooms.createRoom();
  const [a, b] = [new FakeConnection(), new FakeConnection()];
  const pink = rooms.connect(code, a, first)!;
  const blue = rooms.connect(code, b, second)!;
  return { a, b, pink, blue };
}

/** Starts a Run, both walk into the gap and fall, and the Run ends. */
function playRun(scheduler: FakeScheduler, pink: Player, blue: Player) {
  startRun(scheduler, pink, blue);
  pink.receive({ type: "thrust", value: 0.4 });
  blue.receive({ type: "thrust", value: 0.4 });
  scheduler.fire(30 * 10);
  pink.receive({ type: "thrust", value: 0 });
  blue.receive({ type: "thrust", value: 0 });
}

const opening = (conn: FakeConnection) => {
  const run = conn.last("state")!.run;
  return "course" in run ? run.course.opening : undefined;
};

describe("the Opening in a Room", () => {
  it("plays for players with no Team", () => {
    const { rooms, scheduler } = setup();
    const { a, pink, blue } = room(rooms, ANN, BO);
    startRun(scheduler, pink, blue);
    expect(opening(a)).toBe(true);
  });

  it("plays on a known Team's first Run, and later Runs skip it", () => {
    const { rooms, scheduler, scores } = setup();
    scores.nameTeam([ANN, BO], "Sky Pals");
    const { a, pink, blue } = room(rooms, ANN, BO);
    playRun(scheduler, pink, blue);
    expect(opening(a)).toBe(true);

    startRun(scheduler, pink, blue);
    expect(opening(a)).toBe(false);
  });

  it("can be chosen again by either player, for the next Run only", () => {
    const { rooms, scheduler, scores } = setup();
    scores.nameTeam([ANN, BO], "Sky Pals");
    const { a, b, pink, blue } = room(rooms, ANN, BO);
    playRun(scheduler, pink, blue);

    blue.receive({ type: "replayOpening", value: true });
    scheduler.fire();
    for (const conn of [a, b]) expect(conn.last("state")!.replayOpening).toBe(true);
    playRun(scheduler, pink, blue);
    expect(opening(a)).toBe(true);
    expect(a.last("state")!.replayOpening).toBe(false);

    startRun(scheduler, pink, blue);
    expect(opening(a)).toBe(false);
  });

  it("a player can take back replaying it", () => {
    const { rooms, scheduler, scores } = setup();
    scores.nameTeam([ANN, BO], "Sky Pals");
    const { a, pink, blue } = room(rooms, ANN, BO);
    playRun(scheduler, pink, blue);

    pink.receive({ type: "replayOpening", value: true });
    pink.receive({ type: "replayOpening", value: false });
    startRun(scheduler, pink, blue);
    expect(opening(a)).toBe(false);
  });
});
