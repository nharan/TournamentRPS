use axum::{routing::{get, post}, Router, Json};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use hex::ToHex;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/commit", post(commit))
        .route("/reveal", post(reveal));
#[derive(Debug, Deserialize)]
struct CommitReq { match_id: String, did: String, turn: u32, move_: String, nonce: String }

#[derive(Debug, Serialize)]
struct CommitResp { ok: bool, commit: String }

async fn commit(Json(req): Json<CommitReq>) -> Json<CommitResp> {
    let mut hasher = Sha256::new();
    hasher.update(req.move_.as_bytes());
    hasher.update(req.nonce.as_bytes());
    hasher.update(req.turn.to_be_bytes());
    hasher.update(req.match_id.as_bytes());
    hasher.update(req.did.as_bytes());
    let commit = hasher.finalize().encode_hex::<String>();
    Json(CommitResp { ok: true, commit })
}

#[derive(Debug, Deserialize)]
struct RevealReq { commit: String, match_id: String, did: String, turn: u32, move_: String, nonce: String }

#[derive(Debug, Serialize)]
struct RevealResp { ok: bool, valid: bool }

async fn reveal(Json(req): Json<RevealReq>) -> Json<RevealResp> {
    let mut hasher = Sha256::new();
    hasher.update(req.move_.as_bytes());
    hasher.update(req.nonce.as_bytes());
    hasher.update(req.turn.to_be_bytes());
    hasher.update(req.match_id.as_bytes());
    hasher.update(req.did.as_bytes());
    let computed = hasher.finalize().encode_hex::<String>();
    Json(RevealResp { ok: true, valid: computed == req.commit })
}

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
