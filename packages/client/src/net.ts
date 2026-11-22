import type { ClientMessage, ServerMessage } from "@tbob/shared";

export interface RoomSocket {
  send(msg: ClientMessage): void;
}

export async function createRoom(): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error(`Could not create a Room (${res.status})`);
  return ((await res.json()) as { roomCode: string }).roomCode;
}

export function joinRoom(
  roomCode: string,
  onMessage: (msg: ServerMessage) => void,
  onClose: () => void,
): RoomSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(roomCode)}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data as string) as ServerMessage);
  ws.onclose = onClose;
  return {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}
