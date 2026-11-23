import { describe, expect, it } from "vitest";
import { RECONNECT_SECONDS } from "@tbob/shared";
import { FakeConnection, setup, startRun, type FakeScheduler } from "./testing.ts";
import type { Player, RoomRegistry } from "./rooms.ts";

const ANN = "browser-ann";
const BO = "browser-bo";
const CY = "browser-cy";

/** Opens a Room and seats two browsers in it, the first as its creator. */
function room(rooms: RoomRegistry, first: string, second: string) {
  const code = rooms.createRoom();
  const [a, b] = [new FakeConnection(), new FakeConnection()];
  const pink = rooms.connect(code, a, first)!;
  const blue = rooms.connect(code, b, second)!;
  return { a, b, pink, blue };
}

/** Plays one Run: both walk into the gap at 8 m and fall. */
function playRun(scheduler: FakeScheduler, pink: Player, blue: Player) {
  startRun(scheduler, pink, blue);
  pink.receive({ type: "thrust", value: 0.4 });
  blue.receive({ type: "thrust", value: 0.4 });
  scheduler.fire(30 * 10);
  pink.receive({ type: "thrust", value: 0 });
  blue.receive({ type: "thrust", value: 0 });
}

describe("Teams, Team History and Top 10 in a Room", () => {
  it("stores every finished Run with its Distance, time and Run End, and shows it to both players", () => {
    const { rooms, scheduler, scores } = setup({ now: () => 5_000 });
    const { a, b, pink, blue } = room(rooms, ANN, BO);

    playRun(scheduler, pink, blue);

    const [stored] = scores.history([ANN, BO]);
    expect(scores.history([ANN, BO])).toHaveLength(1);
    expect(stored).toMatchObject({ end: "fallen", endedAt: 5_000 });
    expect(stored!.distance).toBeGreaterThan(7.5);
    const ended = a.last("state")!.run;
    expect(ended.phase === "ended" && ended.distance).toBe(stored!.distance);
    // Walking 8 m at Thrust 0.4 takes a few seconds, not none and not the whole 10.
    expect(stored!.seconds).toBeGreaterThan(1);
    expect(stored!.seconds).toBeLessThan(10);
    for (const conn of [a, b]) expect(conn.last("scores")!.history).toEqual([stored]);
  });

  it("offers a new pair to name a Team, and naming it tells both browsers its ID", () => {
    const { rooms, scheduler } = setup();
    const { a, b, pink, blue } = room(rooms, ANN, BO);
    expect(b.last("scores")).toMatchObject({ team: null, canNameTeam: true });

    playRun(scheduler, pink, blue);
    blue.receive({ type: "nameTeam", name: "  Sky   Pals " });

    const team = a.last("scores")!.team!;
    expect(team).toEqual({ id: expect.any(String), name: "Sky Pals" });
    expect(b.last("scores")).toMatchObject({ team, canNameTeam: false });
    // The Run before they named it is in their Team History and on the Top 10.
    expect(b.last("scores")!.history).toHaveLength(1);
    expect(b.last("scores")!.top10).toEqual([{ ...b.last("scores")!.history[0], team }]);
  });

  it("recognises the same two browsers as their Team in a later Room, whoever creates it", () => {
    const { rooms, scheduler } = setup();
    const first = room(rooms, ANN, BO);
    playRun(scheduler, first.pink, first.blue);
    first.pink.receive({ type: "nameTeam", name: "Sky Pals" });
    const team = first.a.last("scores")!.team;
    first.pink.disconnect();
    first.blue.disconnect();

    const later = room(rooms, BO, ANN);

    for (const conn of [later.a, later.b]) {
      expect(conn.last("scores")).toMatchObject({ team, canNameTeam: false });
      expect(conn.last("scores")!.history).toHaveLength(1);
    }
  });

  it("gives a browser playing with a different partner a separate Team", () => {
    const { rooms, scheduler } = setup();
    const first = room(rooms, ANN, BO);
    first.pink.receive({ type: "nameTeam", name: "Sky Pals" });
    const annAndBo = first.a.last("scores")!.team!;
    first.blue.disconnect();
    // Bo's Bird is kept for Bo for a while.
    scheduler.fire(30 * RECONNECT_SECONDS);

    // Then Cy takes Bo's place in the same Room.
    const c = new FakeConnection();
    const cy = rooms.connect(first.a.last("joined")!.roomCode, c, CY)!;
    expect(c.last("scores")).toMatchObject({ team: null, canNameTeam: true });
    playRun(scheduler, first.pink, cy);
    cy.receive({ type: "nameTeam", name: "Sky Pals" });

    const annAndCy = c.last("scores")!.team!;
    expect(annAndCy.id).not.toBe(annAndBo.id);
    expect(c.last("scores")!.history).toHaveLength(1);
  });

  it("keeps separate histories for two pairs with the same team name", () => {
    const { rooms, scheduler } = setup();
    const one = room(rooms, ANN, BO);
    one.pink.receive({ type: "nameTeam", name: "Twins" });
    playRun(scheduler, one.pink, one.blue);
    const two = room(rooms, CY, "browser-di");
    two.pink.receive({ type: "nameTeam", name: "Twins" });

    expect(two.a.last("scores")!.team!.id).not.toBe(one.a.last("scores")!.team!.id);
    expect(two.a.last("scores")!.history).toEqual([]);
    expect(one.a.last("scores")!.history).toHaveLength(1);
  });

  it("doesn't offer to name a Team while a player is alone or has no Browser ID", () => {
    const { rooms } = setup();
    const code = rooms.createRoom();
    const [a, b] = [new FakeConnection(), new FakeConnection()];
    const pink = rooms.connect(code, a, ANN)!;
    expect(a.last("scores")).toMatchObject({ team: null, canNameTeam: false });

    rooms.connect(code, b, "not a browser id!");
    pink.receive({ type: "nameTeam", name: "Nope" });

    expect(a.last("scores")).toMatchObject({ team: null, canNameTeam: false });
  });

  it("doesn't make a Team of one browser playing both Birds (two tabs)", () => {
    const { rooms } = setup();
    const { a, pink } = room(rooms, ANN, ANN);

    pink.receive({ type: "nameTeam", name: "Solo" });

    expect(a.last("scores")).toMatchObject({ team: null, canNameTeam: false });
  });
});
