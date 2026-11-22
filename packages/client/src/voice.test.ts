import { describe, expect, it } from "vitest";
import type { Bird, VoiceSignal } from "@tbob/shared";
import { createVoiceLink, type VoicePeer, type VoiceStatus } from "./voice.ts";

class FakePeer implements VoicePeer {
  connectionState: RTCPeerConnectionState = "new";
  closed = false;
  tracks: MediaStreamTrack[] = [];
  transceivers: string[] = [];
  local: RTCSessionDescriptionInit | null = null;
  remote: RTCSessionDescriptionInit | null = null;
  candidates: RTCIceCandidateInit[] = [];
  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((e: { streams: readonly MediaStream[] }) => void) | null = null;
  onconnectionstatechange: ((e: Event) => void) | null = null;

  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
    return {} as RTCRtpSender;
  }
  addTransceiver(kind: string) {
    this.transceivers.push(kind);
    return {} as RTCRtpTransceiver;
  }
  async createOffer() {
    return { type: "offer" as const, sdp: "offer-sdp" };
  }
  async createAnswer() {
    return { type: "answer" as const, sdp: "answer-sdp" };
  }
  async setLocalDescription(d: RTCSessionDescriptionInit) {
    this.local = d;
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.remote = d;
  }
  async addIceCandidate(c: RTCIceCandidateInit) {
    this.candidates.push(c);
  }
  close() {
    this.closed = true;
  }
  /** Test helpers: what the browser would do. */
  become(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.(new Event("connectionstatechange"));
  }
  gatherCandidate(candidate: string) {
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate, sdpMid: "0", sdpMLineIndex: 0 }) } as RTCIceCandidate } as RTCPeerConnectionIceEvent);
  }
}

const TRACK = { kind: "audio" } as MediaStreamTrack;
const STREAM = { getAudioTracks: () => [TRACK] } as unknown as MediaStream;

function link(bird: Bird, opts: { stream?: MediaStream | null; makePeer?: () => VoicePeer } = {}) {
  const peers: FakePeer[] = [];
  const sent: VoiceSignal[] = [];
  const statuses: VoiceStatus[] = [];
  const remoteStreams: MediaStream[] = [];
  const timers: { fn: () => void; cancelled: boolean }[] = [];
  const voice = createVoiceLink({
    bird,
    stream: opts.stream === undefined ? STREAM : opts.stream,
    send: (s) => sent.push(s),
    makePeer:
      opts.makePeer ??
      (() => {
        const p = new FakePeer();
        peers.push(p);
        return p;
      }),
    onRemoteStream: (s) => remoteStreams.push(s),
    onStatus: (s) => statuses.push(s),
    after: (_ms, fn) => {
      const t = { fn, cancelled: false };
      timers.push(t);
      return () => (t.cancelled = true);
    },
  });
  const timeout = () => timers.filter((t) => !t.cancelled).forEach((t) => t.fn());
  return { voice, peers, sent, statuses, remoteStreams, timeout, status: () => statuses.at(-1) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("Voice link", () => {
  it("waits for the partner, then the pink player offers voice with their mic", async () => {
    const pink = link("pink");
    expect(pink.status()).toBe("waiting");

    pink.voice.partnerPresent(true);
    await settle();

    expect(pink.peers).toHaveLength(1);
    expect(pink.peers[0]!.tracks).toEqual([TRACK]);
    expect(pink.sent).toEqual([{ description: { type: "offer", sdp: "offer-sdp" } }]);
    expect(pink.status()).toBe("connecting");
  });

  it("the blue player answers the offer with their mic, and plays the partner once connected", async () => {
    const blue = link("blue");
    blue.voice.partnerPresent(true);
    await settle();
    expect(blue.sent).toEqual([]);

    blue.voice.receive({ description: { type: "offer", sdp: "offer-sdp" } });
    await settle();
    const peer = blue.peers.at(-1)!;

    expect(peer.remote).toEqual({ type: "offer", sdp: "offer-sdp" });
    expect(peer.tracks).toEqual([TRACK]);
    expect(blue.sent).toEqual([{ description: { type: "answer", sdp: "answer-sdp" } }]);

    const partnerVoice = {} as MediaStream;
    peer.ontrack?.({ streams: [partnerVoice] } as unknown as RTCTrackEvent);
    peer.become("connected");
    expect(blue.remoteStreams).toEqual([partnerVoice]);
    expect(blue.status()).toBe("connected");
  });

  it("swaps connection candidates with the partner", async () => {
    const pink = link("pink");
    pink.voice.partnerPresent(true);
    await settle();
    const peer = pink.peers[0]!;

    peer.gatherCandidate("candidate:mine");
    pink.voice.receive({ description: { type: "answer", sdp: "answer-sdp" } });
    pink.voice.receive({ candidate: { candidate: "candidate:theirs", sdpMid: "0", sdpMLineIndex: 0 } });
    await settle();

    expect(pink.sent).toContainEqual({ candidate: { candidate: "candidate:mine", sdpMid: "0", sdpMLineIndex: 0 } });
    expect(peer.remote).toEqual({ type: "answer", sdp: "answer-sdp" });
    expect(peer.candidates).toEqual([{ candidate: "candidate:theirs", sdpMid: "0", sdpMLineIndex: 0 }]);
  });

  it("only listens when there is no mic (keys mode)", async () => {
    const pink = link("pink", { stream: null });
    pink.voice.partnerPresent(true);
    await settle();

    expect(pink.peers[0]!.tracks).toEqual([]);
    expect(pink.peers[0]!.transceivers).toEqual(["audio"]);
  });

  it("reports voice unavailable when the connection fails", async () => {
    const pink = link("pink");
    pink.voice.partnerPresent(true);
    await settle();

    pink.peers[0]!.become("failed");

    expect(pink.status()).toBe("unavailable");
    expect(pink.peers[0]!.closed).toBe(true);
  });

  it("reports voice unavailable when it doesn't connect in time", async () => {
    const pink = link("pink");
    pink.voice.partnerPresent(true);
    await settle();

    pink.timeout();

    expect(pink.status()).toBe("unavailable");
  });

  it("does not time out a connection that already connected", async () => {
    const pink = link("pink");
    pink.voice.partnerPresent(true);
    await settle();
    pink.peers[0]!.become("connected");

    pink.timeout();

    expect(pink.status()).toBe("connected");
  });

  it("reports voice unavailable when the browser has no WebRTC", async () => {
    const pink = link("pink", {
      makePeer: () => {
        throw new Error("RTCPeerConnection is not defined");
      },
    });
    pink.voice.partnerPresent(true);
    await settle();

    expect(pink.status()).toBe("unavailable");
    expect(pink.sent).toEqual([]);
  });

  it("hangs up when the partner leaves, and calls again when someone rejoins", async () => {
    const pink = link("pink");
    pink.voice.partnerPresent(true);
    await settle();
    pink.peers[0]!.become("failed");

    pink.voice.partnerPresent(false);
    expect(pink.status()).toBe("waiting");

    pink.voice.partnerPresent(true);
    await settle();
    expect(pink.peers).toHaveLength(2);
    expect(pink.status()).toBe("connecting");
    expect(pink.sent.filter((s) => "description" in s)).toHaveLength(2);
  });

  it("starts a fresh call when a new offer arrives", async () => {
    const blue = link("blue");
    blue.voice.partnerPresent(true);
    blue.voice.receive({ description: { type: "offer", sdp: "first" } });
    await settle();
    blue.voice.receive({ description: { type: "offer", sdp: "second" } });
    await settle();

    expect(blue.peers[0]!.closed).toBe(true);
    expect(blue.peers[1]!.remote).toEqual({ type: "offer", sdp: "second" });
    // Late events from the old call change nothing.
    blue.peers[0]!.become("failed");
    expect(blue.status()).toBe("connecting");
  });
});
