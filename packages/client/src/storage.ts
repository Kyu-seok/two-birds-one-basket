/** This browser's storage, which may be blocked (private mode, site data off). */

/** The part of `localStorage` this needs, so tests can pass a fake. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

/** The value stored under `key`, or null if there is none or storage is blocked. */
export function read(storage: KeyValueStore, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value` under `key`, if storage allows. */
export function write(storage: KeyValueStore, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage blocked (private mode, site data off): it lasts only for this page.
  }
}
