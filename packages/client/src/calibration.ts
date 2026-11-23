import { calibrate, loudnessToDb, type Calibration } from "@tbob/shared";
import type { Mic } from "./mic.ts";

const SILENCE_SECONDS = 3;
const VOICE_SECONDS = 4;
const SAMPLE_MS = 50;
/** The meter shows this dB window. */
const METER_MIN_DB = -80;
const METER_MAX_DB = -10;

const DONT_SHOUT = "Don't shout: the game is played without raising your voice.";

/**
 * Guides the player through Calibration in `body`: silence for their Noise Floor, then a
 * comfortable strong voice for their Full Voice, with a live meter. Repeats until it succeeds.
 */
export async function runCalibration(mic: Mic, body: HTMLElement): Promise<Calibration> {
  await prompt(
    body,
    `<p><strong>Calibrate your mic</strong></p>
     <p>Two quick steps: stay silent for a moment, then talk in your comfortable strong voice,
       the way you'd talk to someone across a table.</p>
     <p>${DONT_SHOUT}</p>
     <button id="calib-next">Start</button>`,
  );
  for (;;) {
    const silence = await record(
      mic,
      body,
      `<p><strong>Step 1 of 2: stay silent</strong></p><p>Measuring the noise in your room…</p>`,
      SILENCE_SECONDS,
    );
    const voice = await record(
      mic,
      body,
      `<p><strong>Step 2 of 2: talk in your comfortable strong voice</strong></p>
       <p>Keep talking: count to ten, or say what you had for breakfast. ${DONT_SHOUT}</p>`,
      VOICE_SECONDS,
    );
    const result = calibrate(silence, voice);
    if (result.ok) return result.calibration;
    await prompt(
      body,
      `<p class="error"><strong>Your voice was too close to the room noise.</strong></p>
       <p>Try again somewhere quieter, or a little closer to the mic, talking the way you would
         across a table. ${DONT_SHOUT}</p>
       <button id="calib-next">Try again</button>`,
    );
  }
}

function prompt(body: HTMLElement, html: string): Promise<void> {
  body.innerHTML = html;
  return new Promise((resolve) => {
    document.getElementById("calib-next")!.onclick = () => resolve();
  });
}

/** Shows `html` with a meter and a countdown, and collects Loudness samples for `seconds`. */
function record(mic: Mic, body: HTMLElement, html: string, seconds: number): Promise<number[]> {
  body.innerHTML = `${html}
    <div class="meter"><div class="meter-fill"></div></div>
    <p class="countdown"></p>`;
  const fill = body.querySelector<HTMLElement>(".meter-fill")!;
  const countdown = body.querySelector<HTMLElement>(".countdown")!;
  const samples: number[] = [];
  const start = performance.now();

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const loudness = mic.loudness();
      samples.push(loudness);
      const level = (loudnessToDb(loudness) - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB);
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%`;
      const left = seconds - (performance.now() - start) / 1000;
      countdown.textContent = `${Math.max(0, Math.ceil(left))}`;
      if (left <= 0) {
        clearInterval(timer);
        resolve(samples);
      }
    }, SAMPLE_MS);
  });
}
