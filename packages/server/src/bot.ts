/**
 * Partner bot for testing alone: joins a Room as the other Bird and sends Thrust
 * you control from the keyboard, so one person can play with a real mic in one tab.
 *
 *   npm run bot                 create a Room, print its link, and join it
 *   npm run bot -- ABCDE        join an existing Room
 *
 * Keys: 0-9 set Thrust 0.0-0.9, f = full, w = slow wave 0..1, q = quit.
 * Below 0.6 the Bird walks (0 stands still); 6-9 and f jump.
 */
import { WebSocket } from "ws";
import { TICK_MS, type BirdState, type ServerMessage } from "@tbob/shared";

const SERVER = process.env.SERVER ?? "http://localhost:8100";
const CLIENT = process.env.CLIENT ?? "http://localhost:5173";

async function main() {
  let roomCode = process.argv[2]?.toUpperCase();
  if (!roomCode) {
    const res = await fetch(`${SERVER}/api/rooms`, { method: "POST" });
    roomCode = ((await res.json()) as { roomCode: string }).roomCode;
    console.log(`Created Room ${roomCode}. Open this in your browser:\n  ${CLIENT}/?room=${roomCode}\n`);
  }

  const ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws?room=${roomCode}`);
  let thrust = 0;
  let wave = false;
  let status = "";

  ws.on("message", (data) => {
    const msg = JSON.parse(String(data)) as ServerMessage;
    switch (msg.type) {
      case "joined":
        console.log(`Bot joined as the ${msg.bird} Bird. Keys: 0-9 Thrust, f full, w wave, q quit.`);
        break;
      case "roomFull":
      case "roomNotFound":
        console.log(`Can't join ${roomCode}: ${msg.type}`);
        process.exit(1);
      case "pong":
        ws.send(JSON.stringify({ type: "reportPing", ms: Math.round(performance.now() - msg.t) }));
        break;
      case "fallen":
        console.log("\nFallen: the test Course starts again.");
        break;
      case "state": {
        const { pink, blue } = msg.world.birds;
        const at = (b: BirdState) => `${b.x.toFixed(1)},${b.y.toFixed(1)}`;
        status =
          `bot Thrust ${thrust.toFixed(2)}${wave ? " (wave)" : ""} | ` +
          `Thrust pink ${msg.thrust.pink.toFixed(2)} blue ${msg.thrust.blue.toFixed(2)} | ` +
          `pink ${at(pink)} blue ${at(blue)} Rope ${msg.world.ropeLength.toFixed(1)} m`;
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
    setInterval(() => process.stdout.write(`\r${status.padEnd(90)}`), 100);
  });

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (key: string) => {
    if (key === "q" || key === "\u0003") {
      ws.close();
      process.exit(0);
    }
    if (key === "w") wave = !wave;
    else if (key === "f") (wave = false), (thrust = 1);
    else if (/^[0-9]$/.test(key)) (wave = false), (thrust = Number(key) / 10);
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
