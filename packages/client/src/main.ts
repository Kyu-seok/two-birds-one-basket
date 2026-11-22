import {
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  TICK_MS,
  loudnessToThrust,
  rangeForSensitivity,
  type RopeState,
  type ServerMessage,
  type Side,
} from "@tbob/shared";
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
      <p>Your voice lifts your Bird. No need to shout.</p>
      <button id="enter">Join with mic</button>`);
    document.getElementById("enter")!.onclick = () => enter(code);
    return;
  }
  showPanel(`<p>Walk and jump together, joined by a Rope.</p><button id="create">Create a Room</button>`);
  document.getElementById("create")!.onclick = async () => {
    try {
      const code = await createRoom();
      history.replaceState(null, "", `/?room=${code}`);
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
    mic = await openMic();
  } catch {
    showPanel(`<p class="error">We need your microphone to play. Allow it and reload.</p>`);
    return;
  }

  let mySide: Side | null = null;
  let prev: { msg: StateMsg; at: number } | null = null;
  let latest: { msg: StateMsg; at: number } | null = null;
  let socket: RoomSocket | null = null;

  socket = joinRoom(
    roomCode,
    (msg) => {
      switch (msg.type) {
        case "joined":
          mySide = msg.side;
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
        case "state":
          prev = latest;
          latest = { msg, at: performance.now() };
          break;
      }
    },
    () => {
      if (mySide) showPanel(`<p class="error">Disconnected from the server.</p><button onclick="location.reload()">Rejoin</button>`);
    },
  );

  function start() {
    const draw = createRenderer(canvas);
    let myLoudness = 0;
    let height = 0;

    // Two tabs on one machine share one mic, so holding Space forces full Thrust in this tab
    // to test uneven Thrust by hand.
    let boost = false;
    addEventListener("keydown", (e) => e.code === "Space" && (boost = true));
    addEventListener("keyup", (e) => e.code === "Space" && (boost = false));

    const sensitivity = setupSensitivity();

    const currentThrust = () => {
      // A hidden tab's frame loop pauses; send silence rather than a stale value.
      if (document.hidden) return 0;
      return boost ? 1 : loudnessToThrust(mic.loudness(), rangeForSensitivity(sensitivity.value()));
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

      if (latest && mySide) {
        const rope = prev ? interpolate(prev, latest, now) : latest.msg.rope;
        const s = latest.msg;
        height = Math.max(height, s.rope.y);
        draw({
          height,
          rope,
          thrust: { ...s.thrust, [mySide]: myThrust },
          present: s.present,
          mySide,
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

/** Smooths between the last two server states, rendering one tick behind the newest. */
function interpolate(
  a: { msg: StateMsg; at: number },
  b: { msg: StateMsg; at: number },
  now: number,
): RopeState {
  const t = Math.min(1, Math.max(0, (now - b.at) / TICK_MS));
  const p = a.msg.rope;
  const q = b.msg.rope;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    x: lerp(p.x, q.x),
    y: lerp(p.y, q.y),
    vx: q.vx,
    vy: q.vy,
    angle: lerp(p.angle, q.angle),
    angularVelocity: q.angularVelocity,
  };
}

landing();
