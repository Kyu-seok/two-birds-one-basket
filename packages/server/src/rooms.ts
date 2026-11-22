import {
  BIRDS,
  TEST_COURSE,
  TICK_MS,
  chatText,
  initialWorld,
  partnerOf,
  stepWorld,
  type Bird,
  type ClientMessage,
  type PerBird,
  type ServerMessage,
  voiceSignal,
  type WorldState,
} from "@tbob/shared";

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
  /** Puts the connection into the Room; returns null (after telling the client why) if it can't join. */
  connect(roomCode: string, conn: Connection): Player | null;
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
  world: WorldState;
  thrust: PerBird<number>;
  pings: PerBird<number | null>;
  /** Which players have calibrated; it lasts for every Run while they stay in the Room. */
  calibrated: PerBird<boolean>;
  tick: number;
  stopLoop: (() => void) | null;
}

function broadcast(room: Room, msg: ServerMessage) {
  for (const bird of BIRDS) room.players[bird]?.send(msg);
}

function tick(room: Room) {
  room.world = stepWorld(room.world, room.thrust, TICK_MS / 1000, TEST_COURSE);
  room.tick++;
  if (room.world.fallen) {
    // Until the Run lifecycle exists, Fallen just starts the test Course again.
    room.world = initialWorld();
    broadcast(room, { type: "fallen" });
  }
  broadcast(room, {
    type: "state",
    tick: room.tick,
    world: room.world,
    thrust: { ...room.thrust },
    pings: { ...room.pings },
    present: { pink: !!room.players.pink, blue: !!room.players.blue },
    calibrated: { ...room.calibrated },
  });
}

export function createRoomRegistry(deps: { scheduler: Scheduler; makeCode?: () => string }): RoomRegistry {
  const makeCode = deps.makeCode ?? randomCode;
  const byCode = new Map<string, Room>();

  return {
    createRoom() {
      let code = makeCode();
      while (byCode.has(code)) code = makeCode();
      byCode.set(code, {
        code,
        players: {},
        world: initialWorld(),
        thrust: { pink: 0, blue: 0 },
        pings: { pink: null, blue: null },
        calibrated: { pink: false, blue: false },
        tick: 0,
        stopLoop: null,
      });
      return code;
    },
    connect(roomCode, conn) {
      const room = byCode.get(roomCode);
      if (!room) return reject(conn, { type: "roomNotFound" });
      const bird = BIRDS.find((b) => !room.players[b]);
      if (!bird) return reject(conn, { type: "roomFull" });

      room.players[bird] = conn;
      conn.send({ type: "joined", bird, roomCode });
      room.stopLoop ??= deps.scheduler.every(TICK_MS, () => tick(room));

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
          }
        },
        disconnect() {
          if (room.players[bird] !== conn) return;
          delete room.players[bird];
          room.thrust[bird] = 0;
          room.pings[bird] = null;
          room.calibrated[bird] = false;
          if (!room.players.pink && !room.players.blue) {
            room.stopLoop?.();
            byCode.delete(room.code);
          }
        },
      };
    },
  };
}
