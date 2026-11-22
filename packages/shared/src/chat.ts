/** The longest Room chat message, in characters. */
export const CHAT_MAX_LENGTH = 200;

/**
 * Cleans an untrusted chat message: trims it and cuts it to CHAT_MAX_LENGTH characters
 * (whole characters, so an emoji is never split). Returns null for anything to ignore.
 */
export function chatText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = [...raw.trim()].slice(0, CHAT_MAX_LENGTH).join("");
  return text === "" ? null : text;
}
