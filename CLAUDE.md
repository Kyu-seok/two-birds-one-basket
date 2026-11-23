# Two Birds, One Rope

2-player co-op voice game. See `PLAN.md` for the full design.

## Seeing a change working

`npm run smoke` is the one command for a live check: it starts the real server on a free port with a throwaway score database, has two scripted bots play in one Room, prints a timeline of Run phases, Distance and Run End, and shuts it all down (also on error or Ctrl-C). It exits 0 if a Run got going. Options: `--thrust 0.7`, `--seconds 15`, `--drop pink@5` (that Bird drops at 5 s and rejoins with the same Browser ID 3 s later). The first Run plays the Opening (Distance 0 m); the bots then name a Team, so later Runs count Distance on the random Pieces.

To play by hand, `npm run dev` starts the server and client. With no mic or keyboard:

- `npm run bot -- [ROOMCODE] --thrust 0.4 --seconds 10` plays one Bird at a fixed Thrust and prints the state each second. It presses Ready, and Again after each Run, by itself (interactively, `r` does). Without a Room Code it creates a Room and prints its link. A walking Thrust stalls at the first step; 0.7 hops along.
- Open the client link with `&keys` added (`http://localhost:5173/?room=ROOMCODE&keys`) to play the other Bird with keys: 0-9 set Thrust 0.0-0.9, `f` is full. Click Ready (or Again on the Run End screen) to start a Run.
- Teams: give a bot a fixed `--browser ID` (e.g. `bot-ann-0001`) and `--team NAME`; it names a Team at the first Run End, and the pair is recognised in later Rooms. The server keeps scores in SQLite at `DB_PATH` (default `packages/server/data/scores.db`, gitignored).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `Kyu-seok/two-birds-one-rope`. Read one with `gh issue view <n> --json number,title,body,labels,comments` (plain `gh issue view` prints nothing here). Blocking links between tickets are native GitHub dependencies, not text in the body: list them with `gh api repos/Kyu-seok/two-birds-one-rope/issues/<n>/dependencies/blocked_by`. See `docs/agents/issue-tracker.md` for the rest.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
