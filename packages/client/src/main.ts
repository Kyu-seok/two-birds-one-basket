import {
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  TICK_MS,
  loudnessToThrust,
  rangeForSensitivity,
  type Bird,
  type ServerMessage,
  type WorldState,
} from "@tbob/shared";
import { KEYS_MODE, keyboardThrust } from "./keys.ts";
import { openMic, type Mic } from "./mic.ts";
import { createRoom, joinRoom, type RoomSocket } from "./net.ts";
import { createRenderer } from "./render.ts";

const panel = document.getElementById("panel")!;
const panelBody = document.getElementById("panel-body")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

type StateMsg = Extract<ServerMessage, { type: "state" }>;

function showPanel(html: string) {
  panel.hidden = false;
  panelBody.innerHTML = html;
}

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
  /** Seconds left to show the Fallen banner. */
  let fallenBanner = 0;
  let distance = 0;
  let prev: { msg: StateMsg; at: number } | null = null;
  let latest: { msg: StateMsg; at: number } | null = null;
  let socket: RoomSocket | null = null;

  socket = joinRoom(
    roomCode,
    (msg) => {
      switch (msg.type) {
        case "joined":
          myBird = msg.bird;
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
        case "fallen":
          // The Course reset: don't smooth the Birds back across the whole Course.
          prev = null;
          latest = null;
          fallenBanner = 2;
          distance = 0;
          break;
        case "state":
          prev = latest;
          latest = { msg, at: performance.now() };
          break;
      }
    },
    () => {
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
    const keys = KEYS_MODE ? keyboardThrust() : null;

    const currentThrust = () => {
      // A hidden tab's frame loop pauses; send silence rather than a stale value.
      if (document.hidden) return 0;
      if (boost) return 1;
      if (keys) return keys();
      return loudnessToThrust(mic.loudness(), rangeForSensitivity(sensitivity.value()));
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

      fallenBanner = Math.max(0, fallenBanner - dt);

      if (latest && myBird) {
        const world = prev ? interpolate(prev, latest, now) : latest.msg.world;
        const s = latest.msg;
        // The Bird behind sets the Distance.
        distance = Math.max(distance, Math.min(s.world.birds.pink.x, s.world.birds.blue.x));
        draw({
          world,
          distance,
          thrust: { ...s.thrust, [myBird]: myThrust },
          present: s.present,
          myBird,
          myLoudness,
          pings: s.pings,
          roomCode,
          fallenBanner,
          dt,
        });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

const SENSITIVITY_KEY = "tbob.sensitivity";

/** The in-game Sensitivity slider; the choice is remembered in this browser. */
function setupSensitivity() {
  const label = document.getElementById("sensitivity")!;
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
  label.hidden = false;

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
