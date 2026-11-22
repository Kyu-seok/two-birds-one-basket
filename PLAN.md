# Two Birds, One Basket — Plan

A 2-player co-op voice game for desktop browsers. Two players in different places
each control one bird by **yelling**; together the birds carry a basket with an egg
upward through an endless climb while a hawk chases them from below.

## Core mechanic

- **Twin-thruster control.** Each player owns one bird (left / right) holding one
  side of the basket. Mic **loudness = thrust** (analog). Equal yelling → basket rises
  straight up; one side louder → basket tilts and drifts away from the louder side;
  silence → basket sinks under gravity.
- **Per-player mic calibration**, once per session (with a "recalibrate" button):
  measure silence (noise floor) then max yell; thrust is normalized 0..1 within that range.
- **No auto-scroll.** The world never moves the players; the camera follows the basket.
- **Floaty, heavy physics by design** so network latency reads as inertia.

## Game mode

- **Endless vertical climb** built from hand-authored pieces placed in random order
  each run. Harder pieces appear more often, gaps get narrower and wind gets stronger
  with height.
- **Opening section** (~50m, hand-made, teaches): rise together → steer →
  hold a steady volume → the hawk appears. Played only on a team's first run; later
  runs start where the random pieces begin, with a "replay tutorial" option.
- **First set of pieces (~10, 3 difficulty levels):**
  - Easy: open stretch, wide gap, gentle breeze.
  - Medium: narrow gap, zigzag, low overhang, steady crosswind.
  - Hard: gusts that come in bursts, swinging branch, tight chimney.
- **Pressure — the hawk.** Circles up from below. Its pace rises with height; it
  speeds up when far behind so it stays ~8s behind (no safe lead to rest in). Distance
  meter + a rising screech warn players. Catching the basket = egg snatched = run over.
- **Timing hazards** (gusts, swinging branches) higher up, so lingering is risky.
- **Failure.** The egg takes 3 cracks: each hit cracks it and knocks the basket back,
  and the 3rd crack ends the run. The hawk catching you also ends the run.
- **Score** = highest point reached, in meters. Time taken and cracks are recorded
  in the history but not scored.

## Communication (part of the game)

- **Built-in voice chat** (WebRTC peer-to-peer audio) with browser echo cancellation on.
  **Talking also adds thrust** (same mic), so players decide when and whether to speak.
- **Text chat** in the room — the silent channel (typing makes no noise, but you
  have to look away from the game).
- Headphones recommended, not required.

## Session flow

1. Player A creates a room → gets a shareable link (room code also shown).
2. Player B opens the link; each player takes the left or right bird.
3. Both calibrate mics → both Ready → 3-2-1 countdown → run.
4. End screen: height, how the run ended (hawk / egg broke / disconnect), team
   history, global top 10. Team name entered once and remembered. Both players
   press "Again" to start the next run.
- **Disconnect:** run pauses with the basket frozen; the partner has 30s to reconnect
  through the same link, after which the run ends and is saved.
- No accounts.

## High scores

- **Team history** (each run: height, time, cracks, how it ended) + **global top 10**.
- Team identity = team name + a random ID saved in the browser (so a second team
  can't overwrite your history by typing the same name).
- Stored in SQLite on the server.
- Main goal: the **same pair coming back** to beat their own record.

## Networking & latency

- Target case: players in Korea and Malaysia; server in Korea.
- **Server-authoritative**: clients send loudness ~30 times a second; the server runs
  the physics at 30 Hz and sends the state back; clients smooth the movement between updates.
- Each player's own loudness meter and bird flapping react instantly on their screen;
  the basket reacts about one round trip later.
- Both players' pings are shown on screen. No artificial latency equalizing.

## Stack

- **TypeScript everywhere.**
  - Client: Vite + HTML Canvas.
  - Server: Node + `ws`, one room = one 30 Hz simulation loop.
  - Shared package: level/piece data, message types, physics constants.
- Desktop browsers only.
- Art: simple vector shapes drawn on the Canvas, pastel style. A few sound effects
  (flaps, bump/crack, hawk screech, run over).

## Hosting

- Home mini PC in Korea (Linux + Docker), shared with other projects (CI/CD bursts,
  an idle Qwen3 1.7B model).
- `docker compose`: game server + `cloudflared` (Cloudflare Tunnel). The game
  container gets higher CPU priority (`cpu_shares`) than CI so physics ticks don't stutter.
- Domain: `kyuships.com` (registered at AWS Route 53). Move its nameservers to Cloudflare
  (free plan) and serve the game at **`twobirds.kyuships.com`**.
- WebRTC voice: public STUN servers; a TURN relay server can be added later if some
  connections fail.

## First milestone

Mic loudness from two remote browsers moving one shared basket in a single test
section, through the real server, to test the riskiest parts first: voice input,
the network, and how the lag feels.

## Repo / workflow

- GitHub: `Kyu-seok/two-birds-one-basket` (public).
- Next: `/setup-matt-pocock-skills` → `/grill-with-docs` (glossary + ADRs) →
  `/to-tickets` (GitHub issues).
