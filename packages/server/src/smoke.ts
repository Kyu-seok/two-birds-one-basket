/**
 * A live check in one command: starts the real server on a free port with a throwaway score
 * database, has two scripted bots play in one Room, prints a timeline of the Runs, and shuts
 * everything down.
 *
 *   npm run smoke                                 two bots at Thrust 0.7 for 15 s
 *   npm run smoke -- --thrust 0.4 --seconds 30
 *   npm run smoke -- --drop pink@5                drop pink at 5 s; the same browser rejoins 3 s later
 *
 * Exits 0 if a Run got going (reached running), 1 otherwise.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { partnerOf, type Bird } from "@tbob/shared";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const REJOIN_AFTER_SECONDS = 3;

const { values } = parseArgs({
  options: {
    thrust: { type: "string", default: "0.7" },
    seconds: { type: "string", default: "15" },
    drop: { type: "string" },
  },
});
const seconds = Number(values.seconds);
const thrust = values.thrust;
const drop = parseDrop(values.drop);

/** `pink@5`: which Bird drops, and when. */
function parseDrop(spec: string | undefined): { bird: Bird; at: number } | null {
  if (spec === undefined) return null;
  const m = /^(pink|blue)@(\d+(?:\.\d+)?)$/.exec(spec);
  if (!m) fail(`--drop takes BIRD@SECONDS, e.g. pink@5, not "${spec}"`);
  return { bird: m[1] as Bird, at: Number(m[2]) };
}

function fail(why: string): never {
  console.error(`smoke: ${why}`);
  process.exit(2);
}

const started = performance.now();
const elapsed = () => ((performance.now() - started) / 1000).toFixed(1).padStart(5);
const log = (line: string) => console.log(`${elapsed()}s  ${line}`);

// Everything started here, so nothing outlives the smoke run.
const children = new Set<ChildProcess>();
const dbDir = mkdtempSync(join(tmpdir(), "tbob-smoke-"));
let cleaning: Promise<void> | null = null;
/** Set on Ctrl-C: the signal handler finishes up, not `main`. */
let interrupted = false;

/** Runs a TypeScript file of this package in its own process group, so it can be killed whole. */
function run(file: string, args: string[], env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "--no-warnings", join(SRC, file), ...args], {
    cwd: join(SRC, ".."),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function kill(child: ChildProcess, signal: NodeJS.Signals) {
  try {
    process.kill(-child.pid!, signal);
  } catch {
    // Already gone.
  }
}

/** Stops every child (politely, then not), and deletes the temporary database. */
function cleanUp() {
  return (cleaning ??= stopAll());
}

async function stopAll() {
  for (const c of children) kill(c, "SIGTERM");
  const deadline = Date.now() + 2000;
  while (children.size && Date.now() < deadline) await sleep(50);
  for (const c of children) kill(c, "SIGKILL");
  rmSync(dbDir, { recursive: true, force: true });
}

process.on("exit", () => {
  // A last resort if we exit without cleaning up (it can't wait, so it kills outright).
  for (const c of children) kill(c, "SIGKILL");
  rmSync(dbDir, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    log(`${signal}: shutting down`);
    void cleanUp().then(() => process.exit(130));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves with the first line `child` prints that matches `pattern`, or rejects after `ms`. */
function waitForLine(child: ChildProcess, pattern: RegExp, what: string, ms = 15_000): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout! });
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms);
    const done = (err?: Error, m?: RegExpExecArray) => {
      clearTimeout(timer);
      lines.off("line", onLine);
      child.off("exit", onExit);
      if (err) reject(err);
      else resolve(m!);
    };
    const onLine = (line: string) => {
      const m = pattern.exec(line);
      if (m) done(undefined, m);
    };
    const onExit = (code: number | null) => done(new Error(`${what}: process exited (${code}) first`));
    lines.on("line", onLine);
    child.on("exit", onExit);
  });
}

/** A free TCP port, from the OS. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

/** Phases seen, for the verdict. */
const seen = { running: 0, ended: 0 };

/**
 * Prints the Run's phase changes as one bot sees them. The bot prints its Run's phase on a line
 * of its own whenever it changes (see `describeRun` in bot.ts).
 */
function followRuns(bot: ChildProcess) {
  const lines = createInterface({ input: bot.stdout! });
  lines.on("line", (line) => {
    if (/^Run: /.test(line)) seen.running++;
    if (/^Run End /.test(line)) seen.ended++;
    if (/^(Waiting|Countdown|Run: |Run End |Paused)/.test(line)) log(line.replace(/; Again: .*$/, ""));
    else if (/^\[scores\]/.test(line)) log(line);
  });
}

function relayErrors(child: ChildProcess, name: string) {
  createInterface({ input: child.stderr! }).on("line", (line) => console.error(`[${name}] ${line}`));
}

/** Starts the bot playing `bird` and waits until it has joined as that Bird. */
async function startBot(bird: Bird, env: Record<string, string>, room: string, botSeconds: number) {
  const bot = run("bot.ts", [room, "--thrust", thrust, "--seconds", String(botSeconds), "--browser", `smoke-${bird}-bot`, ...(bird === "pink" ? ["--team", "Smoke"] : [])], env);
  relayErrors(bot, `${bird} bot`);
  const [, joined] = await waitForLine(bot, /joined as the (\w+) Bird|Can't join .*/, `the ${bird} bot to join`);
  if (joined !== bird) throw new Error(`the ${bird} bot joined as ${joined ?? "nothing"}`);
  return bot;
}

const exited = (child: ChildProcess) =>
  new Promise<void>((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", () => resolve())));

async function main() {
  if (!(seconds > 0)) fail(`--seconds must be a positive number, not "${values.seconds}"`);
  if (drop && drop.at >= seconds) fail(`--drop at ${drop.at} s is after the run ends at ${seconds} s`);

  const port = await freePort();
  const server = run("main.ts", [], { PORT: String(port), DB_PATH: join(dbDir, "scores.db") });
  relayErrors(server, "server");
  await waitForLine(server, /Two Birds server on/, "the server to start");
  const url = `http://localhost:${port}`;
  const res = await fetch(`${url}/api/rooms`, { method: "POST" });
  const { roomCode } = (await res.json()) as { roomCode: string };
  log(`server on ${url}, Room ${roomCode}; two bots at Thrust ${thrust} for ${seconds} s${drop ? `, ${drop.bird} drops at ${drop.at} s` : ""}`);

  const env = { SERVER: url };
  // The first to join is pink.
  const bots: Record<Bird, ChildProcess> = { pink: await startBot("pink", env, roomCode, seconds), blue: null! };
  bots.blue = await startBot("blue", env, roomCode, seconds);
  const t0 = performance.now();
  const sinceStart = () => (performance.now() - t0) / 1000;
  // The Bird that stays reports the Run, so the timeline carries on through a drop.
  followRuns(bots[drop ? partnerOf(drop.bird) : "pink"]);

  const watched = [bots[drop ? partnerOf(drop.bird) : "pink"]];
  if (drop) {
    await sleep(drop.at * 1000);
    log(`dropping ${drop.bird}`);
    kill(bots[drop.bird], "SIGTERM");
    await exited(bots[drop.bird]);
    await sleep(REJOIN_AFTER_SECONDS * 1000);
    const left = Math.max(1, Math.round(seconds - sinceStart()));
    log(`${drop.bird} rejoins with the same Browser ID`);
    watched.push(await startBot(drop.bird, env, roomCode, left));
  } else {
    watched.push(bots.blue);
  }

  // The bots quit on their own after --seconds; give them a little slack before stopping them.
  await Promise.race([Promise.all(watched.map(exited)), sleep((seconds + 5) * 1000)]);
  await cleanUp();
  if (interrupted) return new Promise<boolean>(() => {});

  const ok = seen.running > 0;
  log(`${ok ? "OK" : "FAILED"}: running ${seen.running} time(s), ${seen.ended} Run End(s)`);
  return ok;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch(async (e) => {
    log(`FAILED: ${e instanceof Error ? e.message : e}`);
    await cleanUp();
    process.exit(1);
  });
