import {
  SIDES,
  TICK_MS,
  initialRope,
  stepRope,
  type RopeState,
  type ClientMessage,
  type PerSide,
  type ServerMessage,
  type Side,
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
  players: Partial<Record<Side, Connection>>;
  rope: RopeState;
  thrust: PerSide<number>;
  pings: PerSide<number | null>;
  tick: number;
  stopLoop: (() => void) | null;
}

function tick(room: Room) {
  room.rope = stepRope(room.rope, room.thrust, TICK_MS / 1000);
  room.tick++;
  const msg: ServerMessage = {
    type: "state",
    tick: room.tick,
    rope: room.rope,
    thrust: { ...room.thrust },
    pings: { ...room.pings },
    present: { left: !!room.players.left, right: !!room.players.right },
  };
  for (const side of SIDES) room.players[side]?.send(msg);
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
        rope: initialRope(),
        thrust: { left: 0, right: 0 },
        pings: { left: null, right: null },
        tick: 0,
        stopLoop: null,
      });
      return code;
    },
    connect(roomCode, conn) {
      const room = byCode.get(roomCode);
      if (!room) return reject(conn, { type: "roomNotFound" });
      const side = SIDES.find((s) => !room.players[s]);
      if (!side) return reject(conn, { type: "roomFull" });

      room.players[side] = conn;
      conn.send({ type: "joined", side, roomCode });
      room.stopLoop ??= deps.scheduler.every(TICK_MS, () => tick(room));

      return {
        receive(msg) {
          if (room.players[side] !== conn) return;
          switch (msg.type) {
            case "thrust":
              room.thrust[side] = toUnit(msg.value);
              break;
            case "ping":
              conn.send({ type: "pong", t: msg.t });
              break;
            case "reportPing":
              room.pings[side] = Number.isFinite(msg.ms) ? Math.max(0, Math.round(msg.ms)) : null;
              break;
          }
        },
        disconnect() {
          if (room.players[side] !== conn) return;
          delete room.players[side];
          room.thrust[side] = 0;
          room.pings[side] = null;
          if (!room.players.left && !room.players.right) {
            room.stopLoop?.();
            byCode.delete(room.code);
          }
        },
      };
    },
  };
}
