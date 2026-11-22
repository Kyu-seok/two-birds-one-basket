# Two Birds, One Basket — Plan

A 2-player co-op voice game for desktop browsers. Two players in different places
each control one Bird by **yelling**; together the Birds carry a Basket with an Egg
upward through an endless climb while a Hawk chases them from below.

Terms in capitals are defined in `GLOSSARY.md`; key decisions are in `docs/adr/`.

## Core mechanic

- **Twin-thruster control.** Each player takes one Side (Left / Right) and controls
  that Side's Bird. Mic Loudness, after Calibration, becomes **Thrust** (0..1, analog).
  Equal Thrust → the Basket rises straight up; one Side louder → the Basket tilts and
  drifts away from the louder Side; silence → the Basket sinks under gravity.
- **Calibration** once per Room (with a "recalibrate" button): measure the Noise Floor
  (silence) then Max Yell; Thrust is normalized 0..1 within that range.
- **No auto-scroll.** The world never moves the players; the camera follows the Basket.
- **Floaty, heavy physics by design** so network latency reads as inertia.

## Game mode

- **Endless vertical climb.** Each Run's Course is the Opening followed by hand-made
  Pieces placed in random order. Higher Tiers appear more often, gaps get narrower and
  wind gets stronger with Height.
- **Opening** (~50m, hand-made, teaches): rise together → steer →
  hold a steady Thrust → the Hawk appears. Played only on a Team's first Run; later
  Runs start where the random Pieces begin, with a "replay Opening" option.
- **First set of Pieces (~10, 3 Tiers):**
  - Easy: open stretch, wide gap, gentle breeze.
  - Medium: narrow gap, zigzag, low overhang, steady crosswind.
  - Hard: gusts that come in bursts, swinging branch, tight chimney.
- **Pressure — the Hawk** (ADR 0004). Circles up from below. Its pace rises with
  Height; it speeds up when far behind so it stays ~8s behind (no safe lead to rest in).
  Distance meter + a rising screech warn players.
- **Timing hazards** (gusts, swinging branches) in higher Pieces, so lingering is risky.
- **Run End.** The Egg takes 3 Cracks: each hit cracks it and knocks the Basket back.
  A Run ends as **Snatched** (the Hawk catches the Basket), **Broken** (third Crack)
  or **Abandoned** (a player doesn't reconnect within 30s).
- **Height** = highest point reached, in meters; the Run's score. Time taken and
  Cracks are recorded in the Team History but not scored.

## Communication (part of the game)

- **Built-in voice chat** (WebRTC peer-to-peer audio) with browser echo cancellation on.
  **Talking also adds Thrust** (same mic, ADR 0001), so players decide when and
  whether to speak.
- **Text chat** in the Room — the silent channel (typing makes no noise, but you
  have to look away from the game).
- Headphones recommended, not required.

## Room flow

1. One player creates a Room → gets a shareable link (Room Code also shown).
2. The partner opens the link; each player takes a Side.
3. Both calibrate → both Ready → 3-2-1 countdown → Run.
4. Run End screen: Height, Run End reason, Team History, Top 10. Both players press
   "Again" to start the next Run.
- **Disconnect:** the Run pauses with the Basket frozen; the player has 30s to
  reconnect through the same link, after which the Run ends as Abandoned and is saved.
- No accounts.

## Teams and scores

- **Team** = a named pair. Its ID is saved in **both** players' browsers. When a Room
  fills, a Team both browsers belong to is used automatically ("Welcome back, …"),
  regardless of who created the Room. Otherwise the Run End screen offers to name a
  new Team. A browser can belong to many Teams; a team name alone never identifies a
  Team, so another pair can't overwrite your history by typing the same name.
- **Team History** (each Run: Height, time, Cracks, Run End) + **Top 10** across all Teams.
- Stored in SQLite on the server.
- Main goal: the **same pair coming back** to beat their own record.

## Networking & latency

- Target case: players in Korea and Malaysia; server in Korea.
- **Server-authoritative** (ADR 0002): clients send Thrust ~30 times a second; the
  server runs the physics at 30 Hz and sends the state back; clients smooth the
  movement between updates.
- Each player's own Loudness meter and Bird flapping react instantly on their screen;
  the Basket reacts about one round trip later.
- Both players' pings are shown on screen. No artificial latency equalizing (ADR 0003).

## Stack

- **TypeScript everywhere** (ADR 0005).
  - Client: Vite + HTML Canvas.
  - Server: Node + `ws`, one Room = one 30 Hz simulation loop.
  - Shared package: Piece data, message types, physics constants.
- Desktop browsers only.
- Art: simple vector shapes drawn on the Canvas, pastel style. A few sound effects
  (flaps, bump/crack, hawk screech, run over).

## Hosting (ADR 0006)

- Home mini PC in Korea (Linux + Docker), shared with other projects (CI/CD bursts,
  an idle Qwen3 1.7B model).
- `docker compose`: game server + `cloudflared` (Cloudflare Tunnel). The game
  container gets higher CPU priority (`cpu_shares`) than CI so physics ticks don't stutter.
- Domain: `kyuships.com` (registered at AWS Route 53). Move its nameservers to Cloudflare
  (free plan) and serve the game at **`twobirds.kyuships.com`**.
- WebRTC voice: public STUN servers; a TURN relay server can be added later if some
  connections fail.

## First milestone

Thrust from two remote browsers moving one shared Basket in a single test Piece,
through the real server, to test the riskiest parts first: voice input,
the network, and how the lag feels.

## Repo / workflow

- GitHub: `Kyu-seok/two-birds-one-basket` (public).
- Next: `/setup-matt-pocock-skills` → `/grill-with-docs` (glossary + ADRs) →
  `/to-tickets` (GitHub issues).
