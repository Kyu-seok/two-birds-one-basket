import {
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  TICK_MS,
  calibratedRange,
  loudnessToThrust,
  partnerOf,
  type Bird,
  type Calibration,
  type ServerMessage,
  type WorldState,
} from "@tbob/shared";
import { runCalibration } from "./calibration.ts";
import { setupChat } from "./chat.ts";
import { KEYS_MODE, keyboardThrust } from "./keys.ts";
import { openMic, type Mic } from "./mic.ts";
import { createRoom, joinRoom, type RoomSocket } from "./net.ts";
import { createRenderer } from "./render.ts";
import { loadBrowserId, rememberCalibration, rememberTeam, savedCalibration } from "./identity.ts";
import { setupRunScreen, type Scores } from "./run.ts";
import { startVoice, type VoiceLink } from "./voice.ts";

const panel = document.getElementById("panel")!;
const panelBody = document.getElementById("panel-body")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

type StateMsg = Extract<ServerMessage, { type: "state" }>;

function showPanel(html: string) {
  panel.hidden = false;
  panelBody.innerHTML = html;
}

/** Without headphones the partner's voice from speakers can leak into your mic. */
const HEADPHONES_HINT = `<p class="hint">Headphones recommended: you'll hear your partner's voice.</p>`;

function roomLink(code: string) {
  return `${location.origin}/?room=${code}`;
}

function landing() {
  const raw = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  // Only well-formed Room Codes reach the page, so a crafted link can't inject markup.
  const code = /^[A-Z0-9]{1,12}$/.test(raw) ? raw : null;
  if (code) {
    showPanel(`<p>Join Room <span class="code">${code}</span></p>
      <p>Talk to walk your Bird; get louder to jump. No need to shout.</p>
      ${HEADPHONES_HINT}
      <button id="enter">Join with mic</button>`);
    document.getElementById("enter")!.onclick = () => enter(code);
    return;
  }
  showPanel(`<p>Walk and jump together, joined by a Rope.</p><button id="create">Create a Room</button>`);
  document.getElementById("create")!.onclick = async () => {
    try {
      const code = await createRoom();
      history.replaceState(null, "", `/?room=${code}${KEYS_MODE ? "&keys" : ""}`);
      showPanel(`<p>Room Code</p><p class="code">${code}</p>
        <p>Send your partner this link:</p>
        <input class="link" readonly value="${roomLink(code)}" onclick="this.select()" />
        ${HEADPHONES_HINT}
        <p><button id="enter">Enter with mic</button></p>`);
      document.getElementById("enter")!.onclick = () => enter(code);
    } catch (e) {
      showPanel(`<p class="error">${String(e)}</p>`);
    }
  };
}

async function enter(roomCode: string) {
  let mic: Mic;
  try {
    mic = KEYS_MODE ? { loudness: () => 0 } : await openMic();
  } catch {
    showPanel(`<p class="error">We need your microphone to play. Allow it and reload.</p>`);
    return;
  }

  let myBird: Bird | null = null;
  let voice: VoiceLink | null = null;
  let prev: { msg: StateMsg; at: number } | null = null;
  let latest: { msg: StateMsg; at: number } | null = null;
  let socket: RoomSocket | null = null;
  let chat: ReturnType<typeof setupChat> | null = null;
  let scores: Scores | null = null;

  socket = joinRoom(
    roomCode,
    loadBrowserId(localStorage),
    (msg) => {
      switch (msg.type) {
        case "joined":
          myBird = msg.bird;
          chat = setupChat((text) => socket?.send({ type: "chat", text }));
          voice = startVoice(msg.bird, mic.stream ?? null, (signal) => socket?.send({ type: "signal", signal }));
          panel.hidden = true;
          canvas.hidden = false;
          start();
          break;
        case "roomFull":
          showPanel(`<p class="error">Room ${roomCode} already has two players.</p>`);
          break;
        case "roomNotFound":
          showPanel(`<p class="error">Room ${roomCode} doesn't exist (any more).</p>
            <p><a href="/">Create a new Room</a></p>`);
          break;
        case "pong": {
          const rtt = Math.round(performance.now() - msg.t);
          socket?.send({ type: "reportPing", ms: rtt });
          break;
        }
        case "chat":
          chat?.show(msg.bird, msg.text);
          break;
        case "signal":
          voice?.receive(msg.signal);
          break;
        case "scores": {
          const { type: _, ...rest } = msg;
          scores = rest;
          // Both browsers get this, so naming a Team saves its ID in each.
          if (msg.team) rememberTeam(localStorage, msg.team);
          break;
        }
        case "state":
          // A new Run puts the Birds back at the start: don't smooth them back across the Course.
          prev = latest?.msg.run.phase === msg.run.phase ? latest : null;
          latest = { msg, at: performance.now() };
          if (myBird) voice?.partnerPresent(msg.present[partnerOf(myBird)]);
          break;
      }
    },
    () => {
      voice?.close();
      if (myBird) showPanel(`<p class="error">Disconnected from the server.</p><button onclick="location.reload()">Rejoin</button>`);
    },
  );

  function start() {
    const draw = createRenderer(canvas);
    let myLoudness = 0;

    // Two tabs on one machine share one mic, so holding Space forces full Thrust in this tab
    // to test uneven Thrust by hand.
    let boost = false;
    addEventListener("keydown", (e) => e.code === "Space" && (boost = true));
    addEventListener("keyup", (e) => e.code === "Space" && (boost = false));

    const sensitivity = setupSensitivity();
    const runScreen = setupRunScreen(
      (value) => socket?.send({ type: "ready", value }),
      (name) => socket?.send({ type: "nameTeam", name }),
    );
    const keys = KEYS_MODE ? keyboardThrust() : null;

    // Until the player has calibrated (and while they redo it) their voice moves nothing.
    let calibration: Calibration | null = null;
    const recalibrate = document.getElementById("recalibrate") as HTMLButtonElement;
    const doCalibration = async () => {
      calibration = null;
      socket?.send({ type: "calibrated", value: false });
      recalibrate.disabled = true;
      panel.hidden = false;
      calibration = await runCalibration(mic, panelBody);
      rememberCalibration(localStorage, roomCode, calibration);
      panel.hidden = true;
      recalibrate.disabled = false;
      socket?.send({ type: "calibrated", value: true });
    };
    if (keys) {
      // Keys set Thrust directly, so there is nothing to calibrate.
      recalibrate.hidden = true;
      socket?.send({ type: "calibrated", value: true });
    } else {
      recalibrate.onclick = () => {
        recalibrate.blur();
        void doCalibration();
      };
      // Back in a Room after dropping out: the Calibration made here still holds.
      calibration = savedCalibration(localStorage, roomCode);
      if (calibration) socket?.send({ type: "calibrated", value: true });
      else void doCalibration();
    }

    const currentThrust = () => {
      // A hidden tab's frame loop pauses; send silence rather than a stale value.
      if (document.hidden) return 0;
      if (boost) return 1;
      if (keys) return keys();
      if (!calibration) return 0;
      return loudnessToThrust(mic.loudness(), calibratedRange(calibration, sensitivity.value()));
    };

    setInterval(() => socket?.send({ type: "thrust", value: currentThrust() }), TICK_MS);
    const ping = () => socket?.send({ type: "ping", t: performance.now() });
    ping();
    setInterval(ping, 1000);

    let last = performance.now();
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // Read the mic every frame so the own meter and Bird react before any server round trip.
      myLoudness = mic.loudness();
      const myThrust = currentThrust();

      if (latest && myBird) {
        const world = prev ? interpolate(prev, latest, now) : latest.msg.world;
        const s = latest.msg;
        const inRun = s.run.phase === "countdown" || s.run.phase === "running" || s.run.phase === "paused";
        // Calibration waits until the Run is over.
        if (!keys) recalibrate.hidden = inRun;
        runScreen({ run: s.run, myBird, present: s.present, calibrated: s.calibrated, calibrating: !panel.hidden, scores });
        draw({
          world,
          run: s.run,
          thrust: { ...s.thrust, [myBird]: myThrust },
          present: s.present,
          myBird,
          myLoudness,
          pings: s.pings,
          roomCode,
          dt,
        });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

const SENSITIVITY_KEY = "tbob.sensitivity";

/** The in-game Sensitivity slider and recalibrate button; the Sensitivity is remembered in this browser. */
function setupSensitivity() {
  const controls = document.getElementById("controls")!;
  const input = document.getElementById("sensitivity-input") as HTMLInputElement;
  const output = document.getElementById("sensitivity-value") as HTMLOutputElement;

  let value = SENSITIVITY_DEFAULT;
  try {
    const saved = Number(localStorage.getItem(SENSITIVITY_KEY));
    if (saved >= SENSITIVITY_MIN && saved <= SENSITIVITY_MAX) value = saved;
  } catch {
    // Storage blocked: keep the default.
  }

  input.min = String(SENSITIVITY_MIN);
  input.max = String(SENSITIVITY_MAX);
  input.value = String(value);
  output.value = String(value);
  input.oninput = () => {
    value = Number(input.value);
    output.value = input.value;
    try {
      localStorage.setItem(SENSITIVITY_KEY, input.value);
    } catch {
      // Storage blocked: the setting lasts for this page only.
    }
  };
  // Let Space keep working as the test boost after the slider is used.
  input.onchange = () => input.blur();
  controls.hidden = false;

  return { value: () => value };
}

/** Smooths the Birds between the last two server states, rendering one tick behind the newest. */
function interpolate(
  a: { msg: StateMsg; at: number },
  b: { msg: StateMsg; at: number },
  now: number,
): WorldState {
  const t = Math.min(1, Math.max(0, (now - b.at) / TICK_MS));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const p = a.msg.world;
  const q = b.msg.world;
  const bird = (who: Bird) => ({
    ...q.birds[who],
    x: lerp(p.birds[who].x, q.birds[who].x),
    y: lerp(p.birds[who].y, q.birds[who].y),
  });
  return { ...q, birds: { pink: bird("pink"), blue: bird("blue") }, ropeLength: lerp(p.ropeLength, q.ropeLength) };
}

landing();
