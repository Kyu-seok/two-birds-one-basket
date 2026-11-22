# Server-authoritative simulation, no client prediction for the Basket

The server runs the physics at 30 Hz from both players' Thrust and broadcasts the state; clients only smooth between updates. Each player's own Loudness meter and Bird flapping react locally and instantly. The Basket is not predicted on the client, because its motion depends on the partner's voice, which no client can know in advance. Instead the physics is deliberately heavy and floaty so that a round trip of ~100 ms reads as inertia rather than lag.

## Considered Options

- **Host-authoritative (one browser runs the game):** rejected, because the host feels no delay and the other player gets the full round trip.
- **Deterministic lockstep:** rejected as overkill; it needs identical physics on both clients for no gain here.
