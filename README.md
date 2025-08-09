# TournamentRPS

Massively scalable, provably-fair, head-to-head Rock–Paper–Scissors tournament for Bluesky users (AT Protocol).

Monorepo layout:
- `apps/web`: Next.js app with Bluesky login (App Password MVP), WS client
- `services/signaling`: Axum WS server (handles READY_FOR_ROUND, REVEAL stubs)
- `services/coordinator`: Issues JWT match tickets; stub pairing `ready_for_round`
- `services/match-engine`: Placeholder for timers/scoring/AI
- `services/fairness`: Placeholder for VRF/drand
- `services/atproto-writer`: Stub to accept round anchors
- `shared/*`: TS/Rust message types, lexicons, wasm stubs
- `infra/terraform`: GCP scaffolding

Quickstart (dev):
1) Build Rust workspace
   - `cargo build --workspace`
2) Web app
   - `cd apps/web && npm install && npm run dev`
3) Run services locally (different ports)
   - Signaling: `PORT=8081 TICKET_SECRET=dev cargo run -p rps-signaling`
   - Coordinator: `PORT=8082 TICKET_SECRET=dev cargo run -p rps-coordinator`
4) Configure web env
   - `SIGNALING_WS=ws://localhost:8081/ws`
   - `COORDINATOR_HTTP=http://localhost:8082`

MVP flows implemented:
- App Password login with `@atproto/api`
- Coordinator issues short-lived JWT tickets
- Web fetches ticket and connects to signaling WS with `?ticket=`
- WS supports READY_FOR_ROUND, sends stub ASSIGN and TURN_START, accepts REVEAL and returns TURN_RESULT; ends with MATCH_RESULT on first to 5

Next steps:
- Commit–reveal, timers, AI fallback, Firestore, AT Proto anchors
