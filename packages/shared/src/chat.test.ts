import { describe, expect, it } from "vitest";
import { CHAT_MAX_LENGTH, chatText } from "./chat.ts";

describe("chatText", () => {
  it("keeps a message, trimming the space around it", () => {
    expect(chatText("  go now  ")).toBe("go now");
  });

  it("ignores a message that is empty or only whitespace", () => {
    expect(chatText("")).toBeNull();
    expect(chatText(" \n\t ")).toBeNull();
  });

  it("ignores anything that isn't text", () => {
    expect(chatText(42)).toBeNull();
    expect(chatText(undefined)).toBeNull();
  });

  it("limits a message to 200 characters", () => {
    expect(CHAT_MAX_LENGTH).toBe(200);
    expect(chatText("a".repeat(500))).toBe("a".repeat(200));
  });

  it("does not split an emoji when cutting a long message", () => {
    const text = chatText("🐦".repeat(300))!;
    expect([...text]).toHaveLength(200);
    expect(text).toBe("🐦".repeat(200));
  });
});
