/** Test doubles shared by the client's tests. */
import type { KeyValueStore } from "./storage.ts";

export class FakeStorage implements KeyValueStore {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}
