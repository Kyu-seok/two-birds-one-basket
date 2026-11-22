import { describe, expect, it } from "vitest";
import type { ClientMessage } from "@tbob/shared";
import { FakeConnection, setup } from "./testing.ts";

const OFFER = { description: { type: "offer", sdp: "v=0\r\n" } } as const;
const CANDIDATE = { candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0 } };

function room() {
  const { rooms } = setup();
  const code = rooms.createRoom();
  const [a, b] = [new FakeConnection(), new FakeConnection()];
  const pink = rooms.connect(code, a)!;
  const blue = rooms.connect(code, b)!;
  return { a, b, pink, blue };
}

describe("Voice signalling relay", () => {
  it("passes a voice signal to the partner only", () => {
    const { a, b, pink, blue } = room();

    pink.receive({ type: "signal", signal: OFFER });
    blue.receive({ type: "signal", signal: CANDIDATE });

    expect(b.last("signal")).toEqual({ type: "signal", signal: OFFER });
    expect(a.last("signal")).toEqual({ type: "signal", signal: CANDIDATE });
    expect(a.messages.filter((m) => m.type === "signal")).toHaveLength(1);
    expect(b.messages.filter((m) => m.type === "signal")).toHaveLength(1);
  });

  it("drops a signal while the player waits alone", () => {
    const { rooms } = setup();
    const a = new FakeConnection();
    rooms.connect(rooms.createRoom(), a)!.receive({ type: "signal", signal: OFFER });

    expect(a.last("signal")).toBeUndefined();
  });

  it("drops malformed or oversized signals instead of relaying them", () => {
    const { b, pink } = room();
    const bad = [
      null,
      "offer",
      { description: { type: "rollback", sdp: "" } },
      { description: { type: "offer", sdp: 42 } },
      { description: { type: "offer", sdp: "x".repeat(100_000) } },
      { candidate: { candidate: 7 } },
    ];
    for (const signal of bad) pink.receive({ type: "signal", signal } as unknown as ClientMessage);

    expect(b.last("signal")).toBeUndefined();
  });

  it("relays only the known fields of a signal", () => {
    const { b, pink } = room();
    const withJunk = { candidate: { ...CANDIDATE.candidate, usernameFragment: "abc", junk: 1 } };

    pink.receive({ type: "signal", signal: withJunk } as unknown as ClientMessage);

    expect(b.last("signal")).toEqual({
      type: "signal",
      signal: { candidate: { ...CANDIDATE.candidate, usernameFragment: "abc" } },
    });
  });
});
