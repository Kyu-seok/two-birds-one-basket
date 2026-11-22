# Server-authoritative simulation, no client prediction for the Basket

The server runs the physics at 30 Hz from both players' Thrust and broadcasts the state; clients only smooth between updates. Each player's own Loudness meter and Bird flapping react locally and instantly. The Basket is not predicted on the client, because its motion depends on the partner's voice, which no client can know in advance. Instead the physics is deliberately heavy and floaty so that a round trip of ~100 ms reads as inertia rather than lag.

## Considered Options

- **Host-authoritative (one browser runs the game):** rejected, because the host feels no delay and the other player gets the full round trip.
- **Deterministic lockstep:** rejected as overkill; it needs identical physics on both clients for no gain here.

## Consequences

- Revisited when the game became a voice platformer: still server-only. Your own Bird reacts on screen one round trip late, so Pieces must forgive it with a short grace period to jump after leaving a ledge, generous ledges and slow walking. Switch to client prediction for your own Bird only if playtesting shows jumps feel late.
