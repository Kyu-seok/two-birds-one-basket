/**
 * Partner bot for testing alone: joins a Room as the other Bird and sends Thrust
 * you control from the keyboard, so one person can play with a real mic in one tab.
 *
 *   npm run bot                 create a Room, print its link, and join it
 *   npm run bot -- ABCDE        join an existing Room
 *
 * Keys: 0-9 set Thrust 0.0-0.9, f = full, w = slow wave 0..1, r = Ready / Again, q = quit.
 * Below 0.6 the Bird walks (0 stands still); 6-9 and f jump.
 *
 * Scripted, with no keyboard (for agents and smoke tests):
 *   npm run bot -- [ABCDE] --thrust 0.4 [--seconds 10]
 * holds that Thrust, presses Ready (and Again after each Run) by itself, prints the state
 * once a second on its own line, and quits after --seconds if given.
 *
 * `--browser ID` (8-64 letters, digits or dashes) joins as that Browser ID, so two bots run
 * again with the same IDs are recognised as the same Team; `--team NAME` names a new Team at
 * the first Run End. Without --browser each bot is a new browser.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { WebSocket } from "ws";
import { TICK_MS, isReady, type Bird, type BirdState, type RunState, type ServerMessage, wholeSecondsLeft } from "@tbob/shared";

const SERVER = process.env.SERVER ?? "http://localhost:8100";
const CLIENT = process.env.CLIENT ?? "http://localhost:5173";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      thrust: { type: "string" },
      seconds: { type: "string" },
      browser: { type: "string" },
      team: { type: "string" },
    },
  });
  const scripted = values.thrust !== undefined;
  let roomCode = positionals[0]?.toUpperCase();
  if (!roomCode) {
    const res = await fetch(`${SERVER}/api/rooms`, { method: "POST" });
    roomCode = ((await res.json()) as { roomCode: string }).roomCode;
    console.log(`Created Room ${roomCode}. Open this in your browser:\n  ${CLIENT}/?room=${roomCode}\n`);
  }

  const browser = values.browser ?? `bot-${randomUUID()}`;
  const ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws?room=${roomCode}&browser=${encodeURIComponent(browser)}`);
  let thrust = scripted ? Math.min(1, Math.max(0, Number(values.thrust) || 0)) : 0;
  let wave = false;
  let status = "";
  let myBird: Bird | null = null;
  let run: RunState | null = null;
  const sendReady = (value: boolean) => ws.send(JSON.stringify({ type: "ready", value }));

  ws.on("message", (data) => {
    const msg = JSON.parse(String(data)) as ServerMessage;
    switch (msg.type) {
      case "joined":
        myBird = msg.bird;
        console.log(
          scripted
            ? `Bot joined as the ${msg.bird} Bird, holding Thrust ${thrust}.`
            : `Bot joined as the ${msg.bird} Bird. Keys: 0-9 Thrust, f full, w wave, q quit.`,
        );
        // The bot sends Thrust directly, so it has nothing to calibrate.
        ws.send(JSON.stringify({ type: "calibrated", value: true }));
        break;
      case "roomFull":
      case "roomNotFound":
        console.log(`Can't join ${roomCode}: ${msg.type}`);
        process.exit(1);
      case "pong":
        ws.send(JSON.stringify({ type: "reportPing", ms: Math.round(performance.now() - msg.t) }));
        break;
      case "chat":
        console.log(`\n[chat] ${msg.bird}: ${msg.text}`);
        break;
      case "scores": {
        const best = Math.max(0, ...msg.history.map((r) => r.distance));
        const top = msg.top10.map((r) => `${r.team.name} ${r.distance.toFixed(1)}`).join(", ");
        console.log(
          `\n[scores] Team ${msg.team ? `"${msg.team.name}"` : msg.canNameTeam ? "(none yet, can name one)" : "(none)"} | ` +
            `${msg.history.length} Runs, best ${best.toFixed(1)} m | Top 10: ${top || "empty"}`,
        );
        if (values.team && msg.canNameTeam && msg.history.length > 0) {
          ws.send(JSON.stringify({ type: "nameTeam", name: values.team }));
        }
        break;
      }
      case "state": {
        if (msg.run.phase !== run?.phase) console.log(`\n${describeRun(msg.run)}`);
        run = msg.run;
        if (scripted && myBird && "ready" in run && !isReady(run, myBird)) sendReady(true);
        const { pink, blue } = msg.world.birds;
        const at = (b: BirdState) => `${b.x.toFixed(1)},${b.y.toFixed(1)}`;
        status =
          `bot Thrust ${thrust.toFixed(2)}${wave ? " (wave)" : ""} | ` +
          `Thrust pink ${msg.thrust.pink.toFixed(2)} blue ${msg.thrust.blue.toFixed(2)} | ` +
          `pink ${at(pink)} blue ${at(blue)} Rope ${msg.world.ropeLength.toFixed(1)} m | ${describeRun(run)}`;
        break;
      }
    }
  });
  ws.on("close", () => {
    console.log("\nDisconnected.");
    process.exit(0);
  });

  ws.on("open", () => {
    setInterval(() => {
      if (wave) thrust = 0.5 + 0.5 * Math.sin(performance.now() / 1000);
      ws.send(JSON.stringify({ type: "thrust", value: thrust }));
    }, TICK_MS);
    setInterval(() => ws.send(JSON.stringify({ type: "ping", t: performance.now() })), 1000);
    if (scripted) {
      setInterval(() => console.log(status), 1000);
      if (values.seconds !== undefined) {
        setTimeout(() => {
          console.log(status);
          ws.close();
          process.exit(0);
        }, Number(values.seconds) * 1000);
      }
    } else {
      setInterval(() => process.stdout.write(`\r${status.padEnd(90)}`), 100);
    }
  });

  if (scripted) return;
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (key: string) => {
    if (key === "q" || key === "\u0003") {
      ws.close();
      process.exit(0);
    }
    if (key === "r" && run && myBird && "ready" in run) sendReady(!isReady(run, myBird));
    else if (key === "w") wave = !wave;
    else if (key === "f") (wave = false), (thrust = 1);
    else if (/^[0-9]$/.test(key)) (wave = false), (thrust = Number(key) / 10);
  });
}

function describeRun(run: RunState): string {
  const ready = (r: { pink: boolean; blue: boolean }) => `Ready pink ${r.pink ? "yes" : "no"} blue ${r.blue ? "yes" : "no"}`;
  switch (run.phase) {
    case "waiting":
      return `Waiting: ${ready(run.ready)}`;
    case "countdown":
      return `Countdown ${wholeSecondsLeft(run.secondsLeft)}`;
    case "running":
      return `Run: Distance ${run.distance.toFixed(1)} m`;
    case "paused":
      return `Paused: ${run.dropped} dropped, ${wholeSecondsLeft(run.secondsLeft)} s to come back; Distance ${run.distance.toFixed(1)} m`;
    case "ended":
      return `Run End (${run.end}): Distance ${run.distance.toFixed(1)} m; Again: ${ready(run.ready)}`;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
