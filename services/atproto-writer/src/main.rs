use axum::{routing::{get, post}, Router, Json};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use serde::{Deserialize, Serialize};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/round_anchor", post(round_anchor));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[derive(Debug, Deserialize)]
struct RoundAnchorReq {
    tid: String,
    round: u32,
    aliveRoot: String,
    pairingSeed: String,
    merkleRoot: String,
    postedAt: String,
}

#[derive(Debug, Serialize)]
struct RoundAnchorResp { ok: bool }

async fn round_anchor(Json(req): Json<RoundAnchorReq>) -> Json<RoundAnchorResp> {
    tracing::info!(tid = %req.tid, round = %req.round, alive_root = %req.aliveRoot, pairing_seed = %req.pairingSeed, merkle_root = %req.merkleRoot, posted_at = %req.postedAt, "roundAnchor received");
    Json(RoundAnchorResp { ok: true })
}
