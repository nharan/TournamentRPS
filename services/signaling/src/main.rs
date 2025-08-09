use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use futures::{SinkExt, StreamExt};
use rps_shared_types::{ClientToServer, ServerToClient, Assign as AssignMsg, Peer, RtcConfig, TurnStart, TurnResult, MatchResult};
use sha2::{Digest, Sha256};
use hex::ToHex;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use jsonwebtoken::{DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use reqwest::Client as HttpClient;

async fn health() -> &'static str { "ok" }

async fn ws_handler(Query(q): Query<WsAuth>, ws: WebSocketUpgrade) -> axum::response::Response {
    let Some(t) = q.ticket else { return (axum::http::StatusCode::UNAUTHORIZED, "missing ticket").into_response() };
    let Some(claims) = verify_ticket(&t) else { return (axum::http::StatusCode::UNAUTHORIZED, "invalid ticket").into_response() };
    ws.on_upgrade(move |socket| handle_socket(socket, claims.sub)).into_response()
}

#[derive(Debug, serde::Deserialize)]
struct WsAuth { ticket: Option<String> }

#[derive(Debug, Serialize, Deserialize)]
struct Claims { sub: String, mid: String, exp: usize, iat: usize }

fn verify_ticket(ticket: &str) -> Option<Claims> {
    let key = std::env::var("TICKET_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
    jsonwebtoken::decode::<Claims>(ticket, &DecodingKey::from_secret(key.as_bytes()), &Validation::new(Algorithm::HS256)).ok().map(|d| d.claims)
}

async fn handle_socket(mut socket: WebSocket, did: String) {
    let mut p1_score: u32 = 0;
    let mut p2_score: u32 = 0;
    let mut current_turn: u32 = 1;
    let http = HttpClient::new();
    let match_engine = std::env::var("MATCH_ENGINE_HTTP").unwrap_or_else(|_| "http://localhost:8083".to_string());
    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            Message::Text(txt) => {
                tracing::info!(incoming = %txt, "ws text");
                // Try to parse a client message
                match serde_json::from_str::<ClientToServer>(&txt) {
                    Ok(ClientToServer::Heartbeat(_)) => {
                        let _ = socket.send(Message::Text("{\"type\":\"ERROR\",\"data\":{\"code\":\"OK\",\"msg\":\"pong\"}}".into())).await;
                    }
                    Ok(ClientToServer::ReadyForRound(req)) => {
                        // Send ASSIGN stub
                        let assign = AssignMsg {
                            match_id: format!("{}_{}", req.tid, req.round),
                            role: "P1".to_string(),
                            peer: Peer { did: "did:plc:peer".into(), handle: "opponent.example".into() },
                            rtc: RtcConfig { turns: vec![] },
                        };
                        if let Ok(txt) = serde_json::to_string(&ServerToClient::Assign(assign)) {
                            let _ = socket.send(Message::Text(txt)).await;
                        }
                        // Send TURN_START stub
                        let deadline = SystemTime::now()
                            .checked_add(Duration::from_millis(30_000))
                            .unwrap_or(SystemTime::now())
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or(Duration::from_millis(0))
                            .as_millis() as i64;
                        let turn_start = TurnStart { match_id: format!("{}_{}", req.tid, req.round), turn: 1, deadline_ms_epoch: deadline };
                        if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnStart(turn_start)) {
                            let _ = socket.send(Message::Text(txt)).await;
                        }
                    }
                    Ok(ClientToServer::Reveal(rev)) => {
                        // Compute commit like match-engine
                        let mut hasher = Sha256::new();
                        hasher.update(rev.move_.as_bytes());
                        hasher.update(rev.nonce.as_bytes());
                        hasher.update(current_turn.to_be_bytes());
                        hasher.update(rev.match_id.as_bytes());
                        hasher.update(did.as_bytes());
                        let commit = hasher.finalize().encode_hex::<String>();
                        // Validate via match-engine
                        let resp = http.post(format!("{}/reveal", match_engine))
                            .json(&serde_json::json!({
                                "commit": commit,
                                "match_id": rev.match_id,
                                "did": did,
                                "turn": current_turn,
                                "move_": rev.move_,
                                "nonce": rev.nonce,
                            }))
                            .send().await;
                        let valid = match resp {
                            Ok(r) => r.json::<serde_json::Value>().await.ok().and_then(|v| v.get("valid").and_then(|b| b.as_bool())).unwrap_or(false),
                            Err(_) => false,
                        };
                        if !valid {
                            let _ = socket.send(Message::Text("{\"type\":\"ERROR\",\"data\":{\"code\":\"INVALID_REVEAL\",\"msg\":\"commit mismatch\"}}".into())).await;
                            continue;
                        }
                        // Minimal scoring: alternate winner deterministically
                        let winner = if current_turn % 2 == 1 { "P1" } else { "P2" };
                        if winner == "P1" { p1_score += 1; } else { p2_score += 1; }
                        let tr = TurnResult { match_id: String::new(), turn: current_turn, result: winner.into(), ai: Some(false) };
                        if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnResult(tr)) { let _ = socket.send(Message::Text(txt)).await; }
                        if p1_score >= 5 || p2_score >= 5 {
                            let winner_id = if p1_score >= 5 { "P1" } else { "P2" };
                            let mr = MatchResult { match_id: String::new(), winner: winner_id.into() };
                            if let Ok(txt) = serde_json::to_string(&ServerToClient::MatchResult(mr)) { let _ = socket.send(Message::Text(txt)).await; }
                            break;
                        }
                        current_turn += 1;
                    }
                    Ok(other) => {
                        tracing::info!(?other, "unhandled client message");
                        let _ = socket.send(Message::Text("{\"type\":\"ERROR\",\"data\":{\"code\":\"UNIMPLEMENTED\",\"msg\":\"not yet implemented\"}}".into())).await;
                    }
                    Err(err) => {
                        tracing::warn!(%err, "failed to parse client message");
                        let _ = socket.send(Message::Text("{\"type\":\"ERROR\",\"data\":{\"code\":\"BAD_REQUEST\",\"msg\":\"invalid message\"}}".into())).await;
                    }
                }
            }
            Message::Binary(_) => {
                let _ = socket.send(Message::Text("{\"type\":\"ERROR\",\"data\":{\"code\":\"UNSUPPORTED\",\"msg\":\"binary not supported\"}}".into())).await;
            }
            Message::Close(_) => {
                break;
            }
            Message::Ping(p) => { let _ = socket.send(Message::Pong(p)).await; }
            Message::Pong(_) => {}
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(health))
        .route("/ws", get(ws_handler))
        .route("/ready", post(|| async { "ok" }));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "signaling listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
