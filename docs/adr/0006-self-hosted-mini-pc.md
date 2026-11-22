# Self-hosted on a home mini PC behind Cloudflare Tunnel

To keep costs at zero, the server runs on a Linux mini PC in Korea via `docker compose`, reached through a Cloudflare Tunnel at `twobirds.kyuships.com` (DNS for `kyuships.com` moved from Route 53 to Cloudflare; registration stays at AWS). The tunnel provides the HTTPS that browsers require for mic access, needs no port forwarding, and keeps the home IP private, costing ~5–20 ms. The mini PC also runs CI/CD and a local LLM, so the game container gets higher CPU priority to keep simulation ticks steady.

## Consequences

- No cloud region to pick: latency is fixed by Korea's location.
- WebRTC voice uses public STUN servers; TURN (UDP) can't go through the tunnel, so a TURN relay would need port forwarding if ever added.
