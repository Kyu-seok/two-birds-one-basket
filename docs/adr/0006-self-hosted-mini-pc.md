# Self-hosted on a home mini PC behind the existing Cloudflare Tunnel

To keep costs at zero, the server runs on a Linux mini PC in Korea via `docker compose`, reached at `twobirds.kyuships.com` (DNS for `kyuships.com` moved from Route 53 to Cloudflare; registration stays at AWS). The mini PC already runs a Cloudflare Tunnel (`code-bite`) as a host systemd service for other projects, so the game gets one more ingress rule on that tunnel (`twobirds.kyuships.com` → `http://localhost:8100`) rather than its own `cloudflared` container. The tunnel provides the HTTPS that browsers require for mic access, needs no port forwarding, and keeps the home IP private, costing ~5–20 ms. The mini PC also runs CI/CD and local LLMs, so the game container gets higher CPU priority to keep simulation ticks steady.

## Consequences

- No cloud region to pick: latency is fixed by Korea's location.
- The game's compose stack publishes its port on `127.0.0.1:8100` only; the tunnel config lives outside this repo, in `/etc/cloudflared/config.yml` on the mini PC.
- Restarting `cloudflared` briefly interrupts the other sites on the same tunnel.
- WebRTC voice uses public STUN servers; TURN (UDP) can't go through the tunnel, so a TURN relay would need port forwarding if ever added.
