# Two Birds, One Rope — Plan

A 2-player co-op voice platformer for desktop browsers. Two players in different
places each control one Bird with their **voice**. The two Birds are joined by a Rope
and travel together as far as they can along an endless side-scrolling Course.

Terms in capitals are defined in `GLOSSARY.md`; key decisions are in `docs/adr/`.

## Core mechanic

- **Voice moves your Bird.** Mic Loudness, after Calibration and the player's
  Sensitivity, becomes **Thrust** (0..1, analog):
  - silence → your Bird stops;
  - a quieter voice → it walks forward, faster the louder you are;
  - above a threshold → it jumps, higher the louder you are.
  Movement is forward only. Full Thrust is a player's **Full Voice**: a comfortable
  strong voice, never a shout.
- **The Rope** joins the two Birds. Each moves freely within its length and either can
  lead or pass the other. On the ground a tight Rope stops the Bird in front without
  dragging the one behind. Off the ground it acts as a real rope: a Bird that drops
  hangs and swings from its partner.
- **Rescue.** A hanging Bird climbs back up with its voice, its partner can haul it
  up by walking forward, and doing both is fastest. The anchoring Bird has to stay
  put, which means staying silent.
- **Skill, not effort.** Nothing chases you and the screen never scrolls on its own
  (ADR 0007), so players can always go silent to breathe or plan. Pieces punish too
  much voice as much as too little (ADR 0008).
- **Forgiving ledges.** The server runs the simulation, so your own Bird reacts a
  round trip late (ADR 0002). Pieces allow for it: a short grace period to jump after
  leaving a ledge, generous ledges and slow walking.

## Game mode

- **Endless Course.** Each Run's Course is the Opening followed by hand-made Pieces
  placed in random order. Harder Tiers appear more often with Distance.
- **Opening** (~50m, hand-made, teaches): talk to walk → go silent to stop at an edge →
  a small jump → a soft jump under a low ceiling (too loud bonks your head) → a gap
  you must jump together → a safe pit to practise the rescue. Played only on a Team's
  first Run; later Runs start where the random Pieces begin, with a "replay Opening"
  option.
- **First set of Pieces (~10, 3 Tiers):**
  - Easy: flat walk, small gaps, steps up and down, a low ceiling over flat ground.
  - Medium: gaps both Birds must jump close together, crumbling platforms, a gap with a
    low ceiling, moving platforms.
  - Hard: Rope-swing gaps (one Bird anchors while the other swings across), gusts that
    come in bursts, narrow pillars with room for one Bird, a run of precise jumps
    under a ceiling.
- **Hazards only make you fall.** Crumbling and moving platforms, gusts and low
  ceilings all work by dropping a Bird. Nothing kills on touch.
- **Run End.** **Fallen** (both Birds drop with nothing holding them) or
  **Abandoned** (a player doesn't reconnect within 30s). A single dropped Bird hangs
  from the Rope and can be rescued.
- **Distance** = how far the Bird behind got, in meters; the Run's score. Time taken is
  recorded in the Team History but not scored.
- **Camera:** one shared view centred between the two Birds, the same on both screens.

## Communication (part of the game)

- **Built-in voice chat** (WebRTC peer-to-peer audio) with browser echo cancellation on.
  **Talking also moves your Bird** (same mic, ADR 0001): chat while walking on safe
  ground, go quiet at the edge.
- **Text chat** in the Room: the silent channel (typing makes no noise, but you
  have to look away from the game).
- Headphones recommended, not required.

## Room flow

1. One player creates a Room → gets a shareable link (Room Code also shown).
2. The partner opens the link; each player gets a Bird, told apart by colour.
3. Both calibrate (silence, then Full Voice) → both Ready → 3-2-1 countdown → Run.
4. Run End screen: Distance, Run End reason, Team History, Top 10. Both players press
   "Again" to start the next Run.
- **Disconnect:** the Run pauses with both Birds frozen; the player has 30s to
  reconnect through the same link, after which the Run ends as Abandoned and is saved.
- No accounts.

## Teams and scores

- **Team** = a named pair. Its ID is saved in **both** players' browsers. When a Room
  fills, a Team both browsers belong to is used automatically ("Welcome back, …"),
  regardless of who created the Room. Otherwise the Run End screen offers to name a
  new Team. A browser can belong to many Teams; a team name alone never identifies a
  Team, so another pair can't overwrite your history by typing the same name.
- **Team History** (each Run: Distance, time, Run End) + **Top 10** across all Teams.
- Stored in SQLite on the server.
- Main goal: the **same pair coming back** to beat their own record.

## Networking & latency

- Target case: players in Korea and Malaysia; server in Korea.
- **Server-authoritative** (ADR 0002): clients send Thrust ~30 times a second; the
  server runs the physics at 30 Hz and sends the state back; clients smooth the
  movement between updates. Client prediction for your own Bird only if playtests
  show jumps feel late.
- Each player's own Loudness meter reacts instantly on their screen; their Bird reacts
  about one round trip later.
- Both players' pings are shown on screen. No artificial latency equalizing (ADR 0003).

## Stack

- **TypeScript everywhere** (ADR 0005).
  - Client: Vite + HTML Canvas.
  - Server: Node + `ws`, one Room = one 30 Hz simulation loop.
  - Shared package: Piece data, message types, physics constants.
- Desktop browsers only.
- Art: simple vector shapes drawn on the Canvas, pastel style. A few sound effects
  (steps, jump, bonk, Rope snap taut, fall, Run End).

## Hosting (ADR 0006)

- Home mini PC in Korea (Linux + Docker), shared with other projects.
- `docker compose` publishes the game on `127.0.0.1:8100`; the mini PC's existing
  Cloudflare Tunnel serves it at **`twobirds.kyuships.com`**.
- WebRTC voice: public STUN servers; a TURN relay server can be added later if some
  connections fail.

## Milestones

1. Done: the first tracer bullet (#1) proved the plumbing: Rooms, the 30 Hz server
   loop, mic → Thrust, pings, the partner bot (`npm run bot`) and per-player Sensitivity.
2. Next: two voices walk and jump two roped Birds on flat ground with one gap, through
   the real server, to test how voice jumping and the lag feel.

## Repo / workflow

- GitHub: `Kyu-seok/two-birds-one-rope` (public). Issues are the work queue.
