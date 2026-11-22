/**
 * A Browser ID: a random ID each browser makes once and keeps, sent with every join so the
 * server can recognise the same browser across Rooms (its Teams) and within a Room (reconnecting).
 * It is not secret from its own player but is never shown to the partner.
 */
const BROWSER_ID = /^[A-Za-z0-9-]{8,64}$/;

/** A well-formed Browser ID, or null for anything else (missing, malformed or untrusted junk). */
export function browserId(raw: unknown): string | null {
  return typeof raw === "string" && BROWSER_ID.test(raw) ? raw : null;
}
