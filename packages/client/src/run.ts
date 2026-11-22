import {
  TEAM_NAME_MAX_LENGTH,
  isReady,
  partnerOf,
  type Bird,
  type PerBird,
  type RunState,
  type ServerMessage,
  type StoredRun,
} from "@tbob/shared";

export type Scores = Omit<Extract<ServerMessage, { type: "scores" }>, "type">;

const NAME: PerBird<string> = { pink: "Pink", blue: "Blue" };
const RUN_END_TEXT = { fallen: "Fallen: both Birds dropped with nothing holding them." } as const;
const RUN_END_WORD = { fallen: "Fallen" } as const;

export interface RunView {
  run: RunState;
  myBird: Bird;
  present: PerBird<boolean>;
  calibrated: PerBird<boolean>;
  /** The Calibration panel is open, so this screen stays out of its way. */
  calibrating: boolean;
  /** The Room's Team, Team History and Top 10, once the server has sent them. */
  scores: Scores | null;
  /** A player asked for the next Run to start with the Opening again. */
  replayOpening: boolean;
}

/**
 * The screens around a Run: Ready before the first one, and the Run End screen with "Again".
 * During the countdown and the Run itself it is hidden; the canvas shows those.
 */
export function setupRunScreen(
  sendReady: (value: boolean) => void,
  nameTeam: (name: string) => void,
  replayOpening: (value: boolean) => void,
) {
  const box = document.getElementById("run")!;
  let shown = "";

  return function update(v: RunView) {
    const html = v.calibrating ? "" : render(v);
    // Rebuild only on change, so a button isn't replaced under the pointer 30 times a second.
    if (html === shown) return;
    shown = html;
    // Keep a half-typed team name (and its focus) through a rebuild.
    const typing = box.querySelector<HTMLInputElement>("#team-name");
    const typed = typing?.value ?? "";
    const focused = typing !== null && document.activeElement === typing;
    box.hidden = html === "";
    box.innerHTML = html;
    const form = box.querySelector<HTMLFormElement>("#team-form");
    if (form) {
      const input = form.querySelector<HTMLInputElement>("#team-name")!;
      input.value = typed;
      // Typing a name mustn't drive the Bird in keys mode or open the chat.
      input.onkeydown = (e) => e.stopPropagation();
      if (focused) input.focus();
      form.onsubmit = (e) => {
        e.preventDefault();
        if (input.value.trim()) nameTeam(input.value);
      };
    }
    const replay = box.querySelector<HTMLButtonElement>("button.replay");
    if (replay) {
      replay.onclick = () => {
        replay.blur();
        replayOpening(!v.replayOpening);
      };
    }
    const button = box.querySelector<HTMLButtonElement>("button.ready");
    if (button) {
      const ready = isReady(v.run, v.myBird);
      button.onclick = () => {
        button.blur();
        sendReady(!ready);
      };
    }
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function duration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The Team History, newest first, with the best Distance highlighted. */
function historyTable(history: StoredRun[]): string {
  if (history.length === 0) return "";
  const best = history.reduce((b, r) => (r.distance > b.distance ? r : b));
  const rows = [...history]
    .reverse()
    .map(
      (r) => `<tr${r === best ? ` class="best"` : ""} title="${when(r.endedAt)}">
        <td>${r.distance.toFixed(1)} m</td><td>${duration(r.seconds)}</td><td>${RUN_END_WORD[r.end]}</td></tr>`,
    )
    .join("");
  return `<h3>Team History</h3>
    <div class="table"><table><tr><th>Distance</th><th>Time</th><th>Run End</th></tr>${rows}</table></div>`;
}

function topTable({ top10, team }: Scores): string {
  if (top10.length === 0) return "";
  const rows = top10
    .map(
      (r, i) => `<tr${r.team.id === team?.id ? ` class="ours"` : ""} title="${when(r.endedAt)}">
        <td>${i + 1}</td><td>${escapeHtml(r.team.name)}</td><td>${r.distance.toFixed(1)} m</td></tr>`,
    )
    .join("");
  return `<h3>Top 10</h3><div class="table"><table>${rows}</table></div>`;
}

function teamSection(scores: Scores | null): string {
  if (!scores) return "";
  const naming = scores.canNameTeam
    ? `<form id="team-form"><p>Play together again? Name your Team to keep your Team History.</p>
        <input id="team-name" maxlength="${TEAM_NAME_MAX_LENGTH}" placeholder="Team name" autocomplete="off" />
        <button type="submit">Save</button></form>`
    : "";
  return `${naming}${historyTable(scores.history)}${topTable(scores)}`;
}

/**
 * Whether the next Run starts with the Opening, and the button to replay it. A known Team that
 * has finished a Run skips it unless a player asks; everyone else gets it.
 */
function openingLine(scores: Scores | null, replay: boolean): string {
  const skips = !!scores?.team && scores.history.length > 0;
  if (!skips) return `<p class="opening">The Run starts with the Opening, to learn the controls.</p>`;
  return replay
    ? `<p class="opening"><button class="replay pressed">Replay the Opening ✓ (press to take back)</button></p>`
    : `<p class="opening"><button class="replay">Replay the Opening</button></p>`;
}

function render({ run, myBird, present, calibrated, scores, replayOpening }: RunView): string {
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
    ? `<button class="ready pressed">${label} ✓ (press to take back)</button>`
    : `<button class="ready"${calibrated[myBird] ? "" : " disabled"}>${label}</button>`;

  const team = scores?.team ? escapeHtml(scores.team.name) : null;
  const head =
    run.phase === "ended"
      ? `<h2>Run End${team ? `: ${team}` : ""}</h2>
         <p class="distance">${run.distance.toFixed(1)} m</p>
         <p>${RUN_END_TEXT[run.end]}</p>`
      : `<h2>${team ? `Welcome back, ${team}!` : "Ready?"}</h2><p>The Run starts when you both press Ready.</p>`;

  const below = run.phase === "ended" ? teamSection(scores) : "";
  return `${head}<p>${button}</p><p class="partner">${partnerLine}</p>${openingLine(scores, replayOpening)}${below}`;
}
