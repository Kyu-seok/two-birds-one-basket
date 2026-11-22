/**
 * Voice chat signalling: the WebRTC offer/answer and ICE candidates the two players' browsers
 * swap through the server to set up their peer-to-peer voice connection.
 */
export type VoiceSignal =
  | { description: { type: "offer" | "answer"; sdp: string } }
  | {
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment?: string | null;
      };
    };

/** Far above any real audio-only SDP; stops one player flooding the other through the relay. */
const MAX_SIGNAL_TEXT = 20_000;

const isText = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_SIGNAL_TEXT;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Returns a clean copy of an untrusted voice signal with only its known fields, or null if it isn't one. */
export function voiceSignal(raw: unknown): VoiceSignal | null {
  if (!isRecord(raw)) return null;
  const d = raw.description;
  if (isRecord(d)) {
    if ((d.type !== "offer" && d.type !== "answer") || !isText(d.sdp)) return null;
    return { description: { type: d.type, sdp: d.sdp } };
  }
  const c = raw.candidate;
  if (isRecord(c)) {
    if (!isText(c.candidate)) return null;
    const sdpMid = isText(c.sdpMid) ? c.sdpMid : null;
    const sdpMLineIndex = typeof c.sdpMLineIndex === "number" && Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null;
    const candidate: Extract<VoiceSignal, { candidate: unknown }>["candidate"] = { candidate: c.candidate, sdpMid, sdpMLineIndex };
    if (isText(c.usernameFragment)) candidate.usernameFragment = c.usernameFragment;
    return { candidate };
  }
  return null;
}
