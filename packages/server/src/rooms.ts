import {
  BIRDS,
  TEST_COURSE,
  TICK_HZ,
  TICK_MS,
  browserId,
  chatText,
  initialWorld,
  newRoomRun,
  playerLeft,
  setReady,
  stepRun,
  partnerOf,
  type Bird,
  type ClientMessage,
  type PerBird,
  type RunState,
  type ServerMessage,
  voiceSignal,
  type WorldState,
  teamName,
} from "@tbob/shared";
import type { Pair, ScoreStore } from "./scores.ts";

/** One player's link to the server (a WebSocket in production). */
export interface Connection {
  send(msg: ServerMessage): void;
  close(): void;
}

export interface Scheduler {
  /** Calls `fn` every `ms` milliseconds; returns a function that stops it. */
  every(ms: number, fn: () => void): () => void;
}

export interface Player {
  receive(msg: ClientMessage): void;
  disconnect(): void;
}

export interface RoomRegistry {
  /** Creates an empty Room and returns its Room Code. */
  createRoom(): string;
  /**
   * Puts the connection into the Room; returns null (after telling the client why) if it can't join.
   * `browser` is the Browser ID the client sent; anything malformed counts as none.
   */
  connect(roomCode: string, conn: Connection, browser?: unknown): Player | null;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

/** Clamps an untrusted number into 0..1; anything non-numeric counts as 0. */
function toUnit(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function reject(conn: Connection, msg: ServerMessage): null {
  conn.send(msg);
  conn.close();
  return null;
}

interface Room {
  code: string;
  players: Partial<PerBird<Connection>>;
  /** Each present player's Browser ID, or null if they sent none. */
  browsers: PerBird<string | null>;
  world: WorldState;
  thrust: PerBird<number>;
  pings: PerBird<number | null>;
  /** Which players have calibrated; it lasts for every Run while they stay in the Room. */
  calibrated: PerBird<boolean>;
  run: RunState;
  tick: number;
  /** The tick the current Run started on, and the pair playing it; null outside a Run. */
  runStart: { tick: number; pair: Pair | null } | null;
  stopLoop: (() => void) | null;
}

function broadcast(room: Room, msg: ServerMessage) {
  for (const bird of BIRDS) room.players[bird]?.send(msg);
}

/** The Browser IDs of the two players in the Room, or null unless both are here and sent one. */
export function pairOf(room: { browsers: PerBird<string | null> }): Pair | null {
  const { pink, blue } = room.browsers;
  return pink && blue && pink !== blue ? [pink, blue] : null;
}

/** Tells both players their Team (if any), its Team History and the Top 10. */
function sendScores(room: Room, scores: ScoreStore) {
  const pair = pairOf(room);
  const team = pair && scores.teamOf(pair);
  broadcast(room, {
    type: "scores",
    team,
    canNameTeam: pair !== null && team === null,
    history: pair ? scores.history(pair) : [],
    top10: scores.top10(),
  });
}

function tick(room: Room, scores: ScoreStore, now: () => number) {
  const before = room.run.phase;
  const { run, world } = stepRun(room.run, room.world, room.thrust, TICK_MS / 1000, TEST_COURSE);
  room.run = run;
  room.world = world;
  room.tick++;
  if (before !== "running" && run.phase === "running") {
    room.runStart = { tick: room.tick, pair: pairOf(room) };
  }
  const { runStart } = room;
  if (before === "running" && run.phase === "ended" && runStart) {
    scores.saveRun(runStart.pair, {
      distance: run.distance,
      end: run.end,
      seconds: (room.tick - runStart.tick) / TICK_HZ,
      endedAt: now(),
    });
    room.runStart = null;
    sendScores(room, scores);
  }
  broadcast(room, {
    type: "state",
    tick: room.tick,
    world: room.world,
    thrust: { ...room.thrust },
    pings: { ...room.pings },
    present: { pink: !!room.players.pink, blue: !!room.players.blue },
    calibrated: { ...room.calibrated },
    run: room.run,
  });
}

export function createRoomRegistry(deps: {
  scheduler: Scheduler;
  scores: ScoreStore;
  makeCode?: () => string;
  /** The wall clock, in ms since the epoch, for when a Run ended. */
  now?: () => number;
}): RoomRegistry {
  const { scores } = deps;
  const makeCode = deps.makeCode ?? randomCode;
  const now = deps.now ?? Date.now;
  const byCode = new Map<string, Room>();

  return {
    createRoom() {
      let code = makeCode();
      while (byCode.has(code)) code = makeCode();
      byCode.set(code, {
        code,
        players: {},
        browsers: { pink: null, blue: null },
        world: initialWorld(),
        thrust: { pink: 0, blue: 0 },
        pings: { pink: null, blue: null },
        calibrated: { pink: false, blue: false },
        run: newRoomRun(),
        tick: 0,
        runStart: null,
        stopLoop: null,
      });
      return code;
    },
    connect(roomCode, conn, browser) {
      const room = byCode.get(roomCode);
      if (!room) return reject(conn, { type: "roomNotFound" });
      const bird = BIRDS.find((b) => !room.players[b]);
      if (!bird) return reject(conn, { type: "roomFull" });

      room.players[bird] = conn;
      room.browsers[bird] = browserId(browser);
      conn.send({ type: "joined", bird, roomCode });
      sendScores(room, scores);
      room.stopLoop ??= deps.scheduler.every(TICK_MS, () => tick(room, scores, now));

      return {
        receive(msg) {
          if (room.players[bird] !== conn) return;
          switch (msg.type) {
            case "thrust":
              room.thrust[bird] = toUnit(msg.value);
              break;
            case "ping":
              conn.send({ type: "pong", t: msg.t });
              break;
            case "reportPing":
              room.pings[bird] = Number.isFinite(msg.ms) ? Math.max(0, Math.round(msg.ms)) : null;
              break;
            case "calibrated":
              room.calibrated[bird] = msg.value === true;
              // Recalibrating takes back Ready.
              if (!room.calibrated[bird]) room.run = setReady(room.run, bird, false);
              break;
            case "ready":
              room.run = setReady(room.run, bird, msg.value === true && room.calibrated[bird]);
              break;
            case "signal": {
              const signal = voiceSignal(msg.signal);
              const partner = room.players[partnerOf(bird)];
              if (signal && partner) partner.send({ type: "signal", signal });
              break;
            }
            case "chat": {
              const text = chatText(msg.text);
              if (text) broadcast(room, { type: "chat", bird, text });
              break;
            }
            case "nameTeam": {
              const pair = pairOf(room);
              const name = teamName(msg.name);
              if (pair && name && !scores.teamOf(pair)) {
                scores.nameTeam(pair, name);
                sendScores(room, scores);
              }
              break;
            }
          }
        },
        disconnect() {
          if (room.players[bird] !== conn) return;
          delete room.players[bird];
          room.browsers[bird] = null;
          room.thrust[bird] = 0;
          room.pings[bird] = null;
          room.calibrated[bird] = false;
          room.run = playerLeft(room.run, bird);
          if (!room.players.pink && !room.players.blue) {
            room.stopLoop?.();
            byCode.delete(room.code);
          }
        },
      };
    },
  };
}
