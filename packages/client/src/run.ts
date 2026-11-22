import { isReady, partnerOf, type Bird, type PerBird, type RunState } from "@tbob/shared";

const NAME: PerBird<string> = { pink: "Pink", blue: "Blue" };
const RUN_END_TEXT = { fallen: "Fallen: both Birds dropped with nothing holding them." } as const;

export interface RunView {
  run: RunState;
  myBird: Bird;
  present: PerBird<boolean>;
  calibrated: PerBird<boolean>;
  /** The Calibration panel is open, so this screen stays out of its way. */
  calibrating: boolean;
}

/**
 * The screens around a Run: Ready before the first one, and the Run End screen with "Again".
 * During the countdown and the Run itself it is hidden; the canvas shows those.
 */
export function setupRunScreen(sendReady: (value: boolean) => void) {
  const box = document.getElementById("run")!;
  let shown = "";

  return function update(v: RunView) {
    const html = v.calibrating ? "" : render(v);
    // Rebuild only on change, so a button isn't replaced under the pointer 30 times a second.
    if (html === shown) return;
    shown = html;
    box.hidden = html === "";
    box.innerHTML = html;
    const button = box.querySelector("button");
    if (button) {
      const ready = isReady(v.run, v.myBird);
      button.onclick = () => {
        button.blur();
        sendReady(!ready);
      };
    }
  };
}

function render({ run, myBird, present, calibrated }: RunView): string {
  if (run.phase === "countdown" || run.phase === "running") return "";
  const partner = partnerOf(myBird);
  const mine = isReady(run, myBird);
  const label = run.phase === "ended" ? "Again" : "Ready";

  let partnerLine: string;
  if (!present[partner]) partnerLine = `Waiting for ${NAME[partner]} to join…`;
  else if (isReady(run, partner)) partnerLine = `${NAME[partner]} pressed ${label}.`;
  else if (!calibrated[partner]) partnerLine = `${NAME[partner]} is calibrating…`;
  else partnerLine = `Waiting for ${NAME[partner]} to press ${label}…`;

  const button = mine
    ? `<button class="pressed">${label} ✓ (press to take back)</button>`
    : `<button${calibrated[myBird] ? "" : " disabled"}>${label}</button>`;

  const head =
    run.phase === "ended"
      ? `<h2>Run End</h2>
         <p class="distance">${run.distance.toFixed(1)} m</p>
         <p>${RUN_END_TEXT[run.end]}</p>`
      : `<h2>Ready?</h2><p>The Run starts when you both press Ready.</p>`;

  return `${head}<p>${button}</p><p class="partner">${partnerLine}</p>`;
}
