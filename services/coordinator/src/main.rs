use axum::{routing::{get, post}, Router, Json};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use serde::{Deserialize, Serialize};
use jsonwebtoken::{encode, Header, EncodingKey};
use chrono::{Utc, Duration};

#[derive(Debug, Deserialize)]
struct TicketRequest { did: String, match_id: String }

#[derive(Debug, Serialize, Deserialize)]
struct Claims { sub: String, mid: String, exp: usize, iat: usize }

async fn issue_ticket(Json(req): Json<TicketRequest>) -> Json<serde_json::Value> {
    let key = std::env::var("TICKET_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
    let now = Utc::now();
    let exp = now + Duration::minutes(10);
    let claims = Claims {
        sub: req.did,
        mid: req.match_id,
        iat: now.timestamp() as usize,
        exp: exp.timestamp() as usize,
    };
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(key.as_bytes())).unwrap();
    Json(serde_json::json!({ "ticket": token }))
}

#[derive(Debug, Deserialize)]
struct ReadyForRoundReq { tid: String, round: u32, did: String }

#[derive(Debug, Serialize)]
struct ReadyForRoundResp {
    match_id: String,
    role: String,
    peer: serde_json::Value,
    ticket: String,
}

async fn ready_for_round(Json(req): Json<ReadyForRoundReq>) -> Json<ReadyForRoundResp> {
    // Deterministic stub match id and role for MVP
    let match_id = format!("{}-r{}-{}", req.tid, req.round, &req.did);
    let ticket = issue_jwt(&req.did, &match_id);
    let resp = ReadyForRoundResp {
        match_id,
        role: "P1".into(),
        peer: serde_json::json!({"did":"AI","handle":"AI_BYE"}),
        ticket,
    };
    Json(resp)
}

fn issue_jwt(did: &str, match_id: &str) -> String {
    let key = std::env::var("TICKET_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
    let now = Utc::now();
    let exp = now + Duration::minutes(10);
    let claims = Claims {
        sub: did.to_string(),
        mid: match_id.to_string(),
        iat: now.timestamp() as usize,
        exp: exp.timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(key.as_bytes())).unwrap()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ticket", post(issue_ticket))
        .route("/ready_for_round", post(ready_for_round));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
