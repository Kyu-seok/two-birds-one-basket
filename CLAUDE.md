# Two Birds, One Rope

2-player co-op voice game. See `PLAN.md` for the full design.

## Seeing a change working

`npm run dev` starts the server and client. With no mic or keyboard:

- `npm run bot -- [ROOMCODE] --thrust 0.4 --seconds 10` plays one Bird at a fixed Thrust and prints the state each second. It presses Ready, and Again after each Run, by itself (interactively, `r` does). Without a Room Code it creates a Room and prints its link.
- Open the client link with `&keys` added (`http://localhost:5173/?room=ROOMCODE&keys`) to play the other Bird with keys: 0-9 set Thrust 0.0-0.9, `f` is full. Click Ready (or Again on the Run End screen) to start a Run.
- Two scripted bots in one Room play Runs on their own: both walk into the gap, the Run ends as Fallen, and they start the next.
- Teams: give each bot a fixed `--browser ID` (e.g. `bot-ann-0001`) and one of them `--team NAME`; they name a Team at the first Run End and are recognised in later Rooms. Each prints a `[scores]` line (Team, Team History, Top 10). The server keeps scores in SQLite at `DB_PATH` (default `packages/server/data/scores.db`, gitignored).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `Kyu-seok/two-birds-one-rope`. Read one with `gh issue view <n> --json number,title,body,labels,comments` (plain `gh issue view` prints nothing here). See `docs/agents/issue-tracker.md` for the rest.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
