import { describe, expect, it } from "vitest";
import { browserId } from "@tbob/shared";
import { loadBrowserId, rememberTeam, savedTeams } from "./identity.ts";
import type { KeyValueStore } from "./storage.ts";
import { FakeStorage } from "./testing.ts";

describe("Browser ID", () => {
  it("is made once per browser and kept", () => {
    const storage = new FakeStorage();

    const id = loadBrowserId(storage);

    expect(browserId(id)).toBe(id);
    expect(loadBrowserId(storage)).toBe(id);
    expect(loadBrowserId(new FakeStorage())).not.toBe(id);
  });

  it("is replaced if what's stored is malformed", () => {
    const storage = new FakeStorage();
    storage.setItem("tbob.browserId", "<script>");

    expect(browserId(loadBrowserId(storage))).not.toBeNull();
  });

  it("still works for this page when storage is blocked", () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(browserId(loadBrowserId(blocked))).not.toBeNull();
  });
});

describe("Teams saved in the browser", () => {
  it("saves each Team's ID once, keeping its latest name", () => {
    const storage = new FakeStorage();

    rememberTeam(storage, { id: "t1", name: "Sky Pals" });
    rememberTeam(storage, { id: "t2", name: "Other" });
    rememberTeam(storage, { id: "t1", name: "Sky Pals" });

    expect(savedTeams(storage)).toEqual([
      { id: "t1", name: "Sky Pals" },
      { id: "t2", name: "Other" },
    ]);
  });

  it("reads nothing from junk", () => {
    const storage = new FakeStorage();
    storage.setItem("tbob.teams", "{not json");

    expect(savedTeams(storage)).toEqual([]);
  });
});
