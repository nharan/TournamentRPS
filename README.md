# TournamentRPS

Massively scalable, provably‑fair, head‑to‑head Rock–Paper–Scissors tournament for Bluesky (AT Protocol).

## Monorepo layout
- `apps/web`: Next.js app (client UI, Bluesky login)
- `services/signaling`: Axum WebSocket relay (READY_FOR_ROUND, REVEAL, TURN_START/RESULT, MATCH_RESULT)
- `services/coordinator`: Issues JWT match tickets, pairing queue, tournament assign
- `services/match-engine`: Commit/reveal helpers (hashing)
- `services/fairness`: AI move generator placeholders
- `services/atproto-writer`: Stub for anchoring round data
- `shared/*`: TS/Rust shared types
- `tools/simulator`: Local deterministic simulator
- `infra/terraform`: GCP scaffolding

## Prerequisites
- Rust (stable) + Cargo
- Node 20 + npm
- gcloud CLI (for deploys)
- Linux/macOS (commands below use bash)

## Ports
- Web: 3001 (dev)
- Signaling (WS): 8081
- Coordinator (HTTP): 8082
- Match Engine (HTTP): 8083
- Fairness (HTTP): 8084
- ATProto Writer (HTTP): 8085

## Local dev – step by step

Open separate terminals for each service. All commands assume repo root at `/home/john/Developer/TournamentRPS`.

1) Signaling (WebSocket)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS; PORT=8081 TICKET_SECRET=dev MATCH_ENGINE_HTTP=http://localhost:8083 FAIRNESS_HTTP=http://localhost:8084 TURN_DEADLINE_MS=30000 cargo run -p rps-signaling'
```

2) Coordinator (tickets, queue/assignment)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS; PORT=8082 TICKET_SECRET=dev ATPROTO_WRITER_HTTP=http://localhost:8085 cargo run -p rps-coordinator'
```

3) Match Engine (commit/reveal helpers)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS; PORT=8083 cargo run -p rps-match-engine'
```

4) Fairness (AI move placeholder)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS; PORT=8084 cargo run -p rps-fairness'
```

5) ATProto Writer (round anchor stub)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS; PORT=8085 cargo run -p rps-atproto-writer'
```

6) Web app (Next.js)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS/apps/web; NEXT_PUBLIC_SIGNALING_WS=ws://localhost:8081/ws NEXT_PUBLIC_COORDINATOR_HTTP=http://localhost:8082 NEXT_PUBLIC_MATCH_ENGINE_HTTP=http://localhost:8083 npm install && npm run dev -- --port 3001'
```

### Simulator (deterministic 2‑player test with fail‑fast checks)
```bash
bash -lc 'cd /home/john/Developer/TournamentRPS; COORD=http://localhost:8082 SIG=ws://localhost:8081/ws cargo run -p rps-simulator'
```

## Troubleshooting / Cleanup

Hard kill all local processes and free ports:
```bash
bash -lc 'set -euo pipefail; echo "Killing processes on ports: 3000 3001 3010 8080 8081 8082 8083 8084 8085"; for p in 3000 3001 3010 8080 8081 8082 8083 8084 8085; do pids=$(lsof -t -i :$p 2>/dev/null || true); [ -n "$pids" ] && kill -9 $pids || true; done; echo "Killing dev processes by name"; pkill -9 -f "next dev|next start|node .*next" 2>/dev/null || true; pkill -9 -f "rps-signaling|rps-coordinator|rps-match-engine|rps-fairness|rps-atproto-writer" 2>/dev/null || true; pkill -9 -f "cargo run -p rps-" 2>/dev/null || true; if [ -f docker-compose.yml ]; then echo "Bringing down docker compose (if running)"; docker compose down -v --remove-orphans >/dev/null 2>&1 || true; fi; echo "Done."'
```

Restart only the web app on port 3001:
```bash
bash -lc 'set -euo pipefail; P=3001; pid=$(ss -ltnp | grep ":$P" | sed -E "s/.*pid=([0-9]+).*/\1/" | head -n1 || true); [ -n "${pid:-}" ] && kill -9 "$pid" || true; pkill -9 -f "next dev|next start|node .*next" 2>/dev/null || true; sleep 0.3; ss -ltnp | grep ":$P" || true; cd /home/john/Developer/TournamentRPS/apps/web; NEXT_PUBLIC_MODE=normal NEXT_PUBLIC_SIGNALING_WS=ws://localhost:8081/ws NEXT_PUBLIC_COORDINATOR_HTTP=http://localhost:8082 NEXT_PUBLIC_MATCH_ENGINE_HTTP=http://localhost:8083 npm run dev -- --port $P'
```

## Cloud Run (Web only)

Build and deploy the web image (using existing Cloud Run backends):
```bash
# Auth once
gcloud auth login --update-adc
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet

# Build/push only the web image via Cloud Build (uses apps/web/Dockerfile)
cd /home/john/Developer/TournamentRPS
gcloud builds submit --config cloudbuild-web-only.yaml \
  --substitutions _REGION=us-central1,_REPO=rps,_SIGNALING_WS=wss://signaling.peace.zone/ws,_COORDINATOR_HTTP=https://coordinator.peace.zone,_MATCH_ENGINE_HTTP=https://match.peace.zone,_ATPROTO_APPVIEW_HOST=api.bsky.app,_ATPROTO_PDS_URL=https://bsky.social,_TAG=$(git rev-parse --short HEAD)

# Deploy the new image to rps-web
REGION=us-central1
PROJECT_ID=$(gcloud config get-value project)
TAG=$(git rev-parse --short HEAD)
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/rps/web:$TAG"

COORD_URL=$(gcloud run services describe rps-coordinator --region "$REGION" --format='value(status.url)')
MATCH_URL=$(gcloud run services describe rps-match-engine --region "$REGION" --format='value(status.url)')
SIGNAL_URL=$(gcloud run services describe rps-signaling   --region "$REGION" --format='value(status.url)')
SIGNAL_WSS=${SIGNAL_URL/https:/wss:}/ws

gcloud run deploy rps-web --image "$IMAGE" --region "$REGION" --allow-unauthenticated \
  --port 3000 --concurrency 200 --cpu 1 --memory 512Mi \
  --set-env-vars NEXT_PUBLIC_SIGNALING_WS="$SIGNAL_WSS",NEXT_PUBLIC_COORDINATOR_HTTP="$COORD_URL",NEXT_PUBLIC_MATCH_ENGINE_HTTP="$MATCH_URL",NEXT_PUBLIC_ATPROTO_APPVIEW_HOST=api.bsky.app,NEXT_PUBLIC_ATPROTO_PDS_URL=https://bsky.social
```

## Scaling & Cost
- All services default to min-instances 0 (scale to zero when idle).
- Recommended caps:
```bash
gcloud run services update rps-web          --region us-central1 --concurrency 200 --min-instances 0 --max-instances 10
gcloud run services update rps-coordinator  --region us-central1 --concurrency 200 --min-instances 0 --max-instances 10
gcloud run services update rps-match-engine --region us-central1 --concurrency 80  --min-instances 0 --max-instances 10
gcloud run services update rps-fairness     --region us-central1 --concurrency 80  --min-instances 0 --max-instances 10
gcloud run services update rps-signaling    --region us-central1 --concurrency 50  --min-instances 0 --max-instances 10
```

## Notes
- Web Audit panel renders only when `debug` is true in the client state.
- Turn deadline in dev is `TURN_DEADLINE_MS=30000` (30s).
