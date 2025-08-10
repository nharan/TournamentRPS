use axum::{routing::{get, post}, Router, Json};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use serde::{Deserialize, Serialize};
use rand::{RngCore, SeedableRng};
use rand::rngs::StdRng;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ai_move", post(ai_move));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[derive(Debug, Deserialize)]
struct AiMoveReq { match_id: String, turn: u32 }

#[derive(Debug, Serialize)]
struct AiMoveResp { rps: char, vrfOutput: String, vrfProof: String, drandEpoch: u64 }

async fn ai_move(Json(req): Json<AiMoveReq>) -> Json<AiMoveResp> {
    // sample uniformly R/P/S from seeded RNG so it is not always 'R'
    let seed = fxhash::hash64(format!("{}:{}", req.match_id, req.turn).as_bytes());
    let mut rng: StdRng = SeedableRng::seed_from_u64(seed);
    let idx = (rng.next_u32() % 3) as usize;
    let rps = ['R','P','S'][idx];
    Json(AiMoveResp { rps, vrfOutput: "0x00".into(), vrfProof: "0x00".into(), drandEpoch: 0 })
}
