/** The longest Room chat message, in characters. */
export const CHAT_MAX_LENGTH = 200;

/**
 * Cleans an untrusted chat message: trims it and cuts it to CHAT_MAX_LENGTH characters
 * (whole characters, so an emoji is never split). Returns null for anything to ignore.
 */
export function chatText(raw: unknown): string | null {
  return cleanText(raw, CHAT_MAX_LENGTH);
}

/**
 * An untrusted string, `tidy`-ed, trimmed and cut to `maxLength` whole characters (so an emoji is
 * never split); null if it isn't a string or nothing is left.
 */
export function cleanText(raw: unknown, maxLength: number, tidy: (s: string) => string = (s) => s): string | null {
  if (typeof raw !== "string") return null;
  const text = [...tidy(raw).trim()].slice(0, maxLength).join("").trim();
  return text === "" ? null : text;
}
