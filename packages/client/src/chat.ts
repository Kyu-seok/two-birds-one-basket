import { CHAT_MAX_LENGTH, chatText, type Bird } from "@tbob/shared";
import { BIRD_COLORS } from "./render.ts";

/**
 * The Room chat box: the silent way to coordinate, since talking moves your Bird (ADR 0001).
 * Enter opens it from the game; Escape returns to the game.
 */
export function setupChat(send: (text: string) => void) {
  const form = document.getElementById("chat") as HTMLFormElement;
  const log = document.getElementById("chat-log")!;
  const input = document.getElementById("chat-input") as HTMLInputElement;

  input.maxLength = CHAT_MAX_LENGTH;
  // Game controls listen on window: keys typed here must never reach them.
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") input.blur();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = chatText(input.value);
    if (text) send(text);
    input.value = "";
  };
  form.hidden = false;

  return {
    show(bird: Bird, text: string) {
      const line = document.createElement("li");
      line.textContent = text;
      line.style.background = BIRD_COLORS[bird];
      log.append(line);
      log.scrollTop = log.scrollHeight;
    },
  };
}
