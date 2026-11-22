/**
 * Keyboard test mode (dev builds only): add `?keys` to the URL and number keys stand in
 * for the mic, the same keys as the partner bot. 0-9 set Thrust 0.0-0.9 and f is full.
 * It lets an agent, or anyone without a mic, drive a Bird from a browser.
 */
export const KEYS_MODE = import.meta.env.DEV && new URLSearchParams(location.search).has("keys");

/** Starts listening for keys; returns the Thrust they currently set. */
export function keyboardThrust(): () => number {
  let thrust = 0;
  addEventListener("keydown", (e) => {
    if (e.key === "f") thrust = 1;
    else if (/^[0-9]$/.test(e.key)) thrust = Number(e.key) / 10;
  });
  return () => thrust;
}
