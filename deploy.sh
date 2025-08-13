#!/usr/bin/env bash
set -euo pipefail

REGION=${REGION:-us-central1}
REPO=${REPO:-rps}
PROJECT_ID=$(gcloud config get-value project)

echo "Project: $PROJECT_ID  Region: $REGION  Repo: $REPO"

echo "Enabling APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

echo "Creating Artifact Registry repo (if not exists)..."
gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="RPS images" || true

echo "Creating TICKET_SECRET (if not exists)..."
if ! gcloud secrets describe TICKET_SECRET >/dev/null 2>&1; then
  head -c 32 /dev/urandom | base64 | gcloud secrets create TICKET_SECRET --data-file=-
else
  echo "TICKET_SECRET exists; using latest version"
fi

echo "Building and pushing images via Cloud Build..."
gcloud builds submit --config cloudbuild.yaml --substitutions _REGION="$REGION",_REPO="$REPO"

FAIR_IMG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/fairness:latest"
MATCH_IMG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/match-engine:latest"
COORD_IMG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/coordinator:latest"
SIGNAL_IMG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/signaling:latest"
WEB_IMG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/web:latest"

echo "Deploying fairness..."
gcloud run deploy rps-fairness --image "$FAIR_IMG" --region "$REGION" --allow-unauthenticated \
  --port 8084 --concurrency 80 --cpu 1 --memory 512Mi

echo "Deploying match-engine..."
gcloud run deploy rps-match-engine --image "$MATCH_IMG" --region "$REGION" --allow-unauthenticated \
  --port 8083 --concurrency 80 --cpu 1 --memory 512Mi

echo "Deploying coordinator..."
gcloud run deploy rps-coordinator --image "$COORD_IMG" --region "$REGION" --allow-unauthenticated \
  --port 8082 --concurrency 200 --cpu 1 --memory 512Mi \
  --set-secrets TICKET_SECRET=TICKET_SECRET:latest

FAIR_URL=$(gcloud run services describe rps-fairness --region "$REGION" --format='value(status.url)')
MATCH_URL=$(gcloud run services describe rps-match-engine --region "$REGION" --format='value(status.url)')

echo "Deploying signaling..."
gcloud run deploy rps-signaling --image "$SIGNAL_IMG" --region "$REGION" --allow-unauthenticated \
  --port 8081 --concurrency 50 --cpu 1 --memory 1Gi \
  --set-secrets TICKET_SECRET=TICKET_SECRET:latest \
  --set-env-vars TURN_DEADLINE_MS=30000,MATCH_ENGINE_HTTP="$MATCH_URL",FAIRNESS_HTTP="$FAIR_URL"

SIGNAL_URL=$(gcloud run services describe rps-signaling --region "$REGION" --format='value(status.url)')
COORD_URL=$(gcloud run services describe rps-coordinator --region "$REGION" --format='value(status.url)')
SIGNAL_WSS=${SIGNAL_URL/https:/wss:}

echo "Deploying web..."
gcloud run deploy rps-web --image "$WEB_IMG" --region "$REGION" --allow-unauthenticated \
  --port 3000 --concurrency 200 --cpu 1 --memory 512Mi \
  --set-env-vars NEXT_PUBLIC_SIGNALING_WS="${SIGNAL_WSS}/ws",NEXT_PUBLIC_COORDINATOR_HTTP="$COORD_URL",NEXT_PUBLIC_MATCH_ENGINE_HTTP="$MATCH_URL",NEXT_PUBLIC_ATPROTO_APPVIEW_HOST=api.bsky.app,NEXT_PUBLIC_ATPROTO_PDS_URL=https://bsky.social

WEB_URL=$(gcloud run services describe rps-web --region "$REGION" --format='value(status.url)')
echo "\nDeployed! Open: $WEB_URL"


