/**
 * Mic Loudness, read from the analyser on demand so the player's own meter and
 * Bird react the same frame they make noise.
 */
export interface Mic {
  /** Smoothed RMS of the mic signal, 0..1. */
  loudness(): number;
  /** The mic stream itself, also sent to the partner as voice chat (ADR 0001). Absent in keys mode. */
  stream?: MediaStream;
}

/** Smoothing time constants: rise quickly when a voice starts, fall a little slower so a held note reads as steady. */
const RISE_SECONDS = 0.05;
const FALL_SECONDS = 0.15;

/**
 * One stream for Calibration, Thrust and voice chat, so all three hear the same thing. Echo
 * cancellation stays on so the partner's voice from speakers doesn't become our Thrust.
 */
const MIC_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: false, autoGainControl: false };

export async function openMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let smoothed = 0;
  let lastRead = performance.now();

  return {
    stream,
    loudness() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const raw = Math.sqrt(sum / buf.length);

      // Time-based, so it behaves the same whether read by the frame loop or the send loop.
      const now = performance.now();
      const dt = (now - lastRead) / 1000;
      lastRead = now;
      const tau = raw > smoothed ? RISE_SECONDS : FALL_SECONDS;
      smoothed += (raw - smoothed) * (1 - Math.exp(-dt / tau));
      return smoothed;
    },
  };
}
