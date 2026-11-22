import type { Bird, VoiceSignal } from "@tbob/shared";

/**
 * Peer-to-peer voice chat with the partner. It sends the same mic stream that drives Thrust,
 * so talking to your partner moves your Bird (ADR 0001). Voice is a bonus: if it can't connect,
 * the game carries on and the player is told voice is unavailable.
 */
export type VoiceStatus = "waiting" | "connecting" | "connected" | "unavailable";

/** The part of RTCPeerConnection the voice link uses, so tests can stand in for the browser. */
export interface VoicePeer {
  readonly connectionState: RTCPeerConnectionState;
  onicecandidate: ((e: RTCPeerConnectionIceEvent) => void) | null;
  ontrack: ((e: RTCTrackEvent) => void) | null;
  onconnectionstatechange: ((e: Event) => void) | null;
  addTrack(track: MediaStreamTrack, stream: MediaStream): unknown;
  addTransceiver(kind: "audio", init: { direction: "recvonly" }): unknown;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(c: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export interface VoiceLinkDeps {
  bird: Bird;
  /** The mic stream that also drives Thrust; null in keys mode, where we only listen. */
  stream: MediaStream | null;
  send(signal: VoiceSignal): void;
  makePeer(): VoicePeer;
  onRemoteStream(stream: MediaStream): void;
  onStatus(status: VoiceStatus): void;
  /** Runs `fn` after `ms`; returns a function that cancels it. */
  after(ms: number, fn: () => void): () => void;
}

/** Give up on voice if it hasn't connected this long after the partner arrives. */
export const VOICE_CONNECT_TIMEOUT_MS = 15_000;

export interface VoiceLink {
  /** Feed the partner's presence from each state message; connects when they arrive and hangs up when they leave. */
  partnerPresent(present: boolean): void;
  /** A signal relayed from the partner. */
  receive(signal: VoiceSignal): void;
  close(): void;
}

export function createVoiceLink(deps: VoiceLinkDeps): VoiceLink {
  let present = false;
  let peer: VoicePeer | null = null;
  let status: VoiceStatus | null = null;
  let cancelTimeout: (() => void) | null = null;

  const setStatus = (s: VoiceStatus) => {
    if (s === status) return;
    status = s;
    deps.onStatus(s);
  };

  const hangUp = () => {
    cancelTimeout?.();
    cancelTimeout = null;
    peer?.close();
    peer = null;
  };

  const fail = (from: VoicePeer | null) => {
    // Ignore late failures from a connection we already replaced.
    if (from !== peer) return;
    hangUp();
    setStatus("unavailable");
  };

  /** Starts a fresh connection to the partner, or reports voice unavailable if the browser can't. */
  const open = (): VoicePeer | null => {
    hangUp();
    let p: VoicePeer;
    try {
      p = deps.makePeer();
    } catch {
      setStatus("unavailable");
      return null;
    }
    peer = p;
    setStatus("connecting");
    cancelTimeout = deps.after(VOICE_CONNECT_TIMEOUT_MS, () => {
      if (peer === p && p.connectionState !== "connected") fail(p);
    });
    p.onicecandidate = (e) => {
      if (peer !== p || !e.candidate) return;
      const { candidate = "", sdpMid = null, sdpMLineIndex = null, usernameFragment } = e.candidate.toJSON();
      deps.send({ candidate: { candidate, sdpMid, sdpMLineIndex, ...(usernameFragment ? { usernameFragment } : {}) } });
    };
    p.ontrack = (e) => {
      if (peer === p && e.streams[0]) deps.onRemoteStream(e.streams[0]);
    };
    p.onconnectionstatechange = () => {
      if (peer !== p) return;
      if (p.connectionState === "connected") {
        cancelTimeout?.();
        cancelTimeout = null;
        setStatus("connected");
      } else if (p.connectionState === "failed") {
        fail(p);
      }
    };
    return p;
  };

  /** Sends our mic to the partner, or in keys mode (no mic) just asks to hear them. */
  const addMic = (p: VoicePeer) => {
    const track = deps.stream?.getAudioTracks()[0];
    if (track && deps.stream) p.addTrack(track, deps.stream);
    else p.addTransceiver("audio", { direction: "recvonly" });
  };

  const offer = async () => {
    const p = open();
    if (!p) return;
    try {
      addMic(p);
      const description = await p.createOffer();
      await p.setLocalDescription(description);
      if (peer === p) deps.send({ description: { type: "offer", sdp: description.sdp ?? "" } });
    } catch {
      fail(p);
    }
  };

  setStatus("waiting");

  return {
    partnerPresent(now) {
      if (now === present) return;
      present = now;
      if (!now) {
        hangUp();
        setStatus("waiting");
      } else if (deps.bird === "pink") {
        // One side offers so the two never talk over each other; the other answers.
        void offer();
      }
    },
    receive(signal) {
      void (async () => {
        if ("description" in signal) {
          const { description } = signal;
          if (description.type === "offer") {
            // A new offer always means a fresh call: the partner may have rejoined.
            const p = open();
            if (!p) return;
            try {
              await p.setRemoteDescription(description);
              addMic(p);
              const answer = await p.createAnswer();
              await p.setLocalDescription(answer);
              if (peer === p) deps.send({ description: { type: "answer", sdp: answer.sdp ?? "" } });
            } catch {
              fail(p);
            }
          } else {
            const p = peer;
            try {
              await p?.setRemoteDescription(description);
            } catch {
              fail(p);
            }
          }
        } else {
          // A stray or early candidate isn't worth dropping the call over.
          await peer?.addIceCandidate(signal.candidate).catch(() => {});
        }
      })();
    },
    close() {
      present = false;
      hangUp();
    },
  };
}

/** Public STUN servers: enough for most home connections; there is no TURN relay. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

const STATUS_TEXT: Record<VoiceStatus, string> = {
  waiting: "Voice: waiting for your partner",
  connecting: "Voice: connecting…",
  connected: "Voice on",
  unavailable: "Voice unavailable: use the chat",
};

/** Voice chat in the browser: real WebRTC, the partner's voice on an audio element, and the status line. */
export function startVoice(bird: Bird, stream: MediaStream | null, send: (signal: VoiceSignal) => void): VoiceLink {
  const statusLine = document.getElementById("voice-status")!;
  // A media element (not Web Audio) so the browser's echo cancellation can hear what it plays.
  const audio = document.createElement("audio");
  audio.autoplay = true;
  document.body.append(audio);

  return createVoiceLink({
    bird,
    stream,
    send,
    makePeer: () => new RTCPeerConnection({ iceServers: ICE_SERVERS }),
    onRemoteStream(remote) {
      audio.srcObject = remote;
      audio.play().catch(() => {
        // Autoplay was blocked; the next click or key starts it.
        const resume = () => void audio.play().catch(() => {});
        addEventListener("pointerdown", resume, { once: true });
        addEventListener("keydown", resume, { once: true });
      });
    },
    onStatus(status) {
      statusLine.textContent = STATUS_TEXT[status];
      statusLine.dataset.status = status;
      statusLine.hidden = false;
    },
    after(ms, fn) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
}
