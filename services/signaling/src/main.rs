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
use std::time::{SystemTime, UNIX_EPOCH, Duration};

async fn health() -> &'static str { "ok" }

async fn ws_handler(Query(q): Query<WsAuth>, ws: WebSocketUpgrade) -> axum::response::Response {
    if let Some(t) = q.ticket {
        if !verify_ticket(&t) {
            return (axum::http::StatusCode::UNAUTHORIZED, "invalid ticket").into_response();
        }
    } else {
        return (axum::http::StatusCode::UNAUTHORIZED, "missing ticket").into_response();
    }
    ws.on_upgrade(handle_socket).into_response()
}

#[derive(Debug, serde::Deserialize)]
struct WsAuth { ticket: Option<String> }

fn verify_ticket(ticket: &str) -> bool {
    let key = std::env::var("TICKET_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
    jsonwebtoken::decode::<serde_json::Value>(ticket, &jsonwebtoken::DecodingKey::from_secret(key.as_bytes()), &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256)).is_ok()
}

async fn handle_socket(mut socket: WebSocket) {
    let mut p1_score: u32 = 0;
    let mut p2_score: u32 = 0;
    let mut current_turn: u32 = 1;
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
                        // Minimal scoring: accept any reveal and alternate winner deterministically
                        let winner = if current_turn % 2 == 1 { "P1" } else { "P2" };
                        if winner == "P1" { p1_score += 1; } else { p2_score += 1; }
                        let tr = TurnResult { match_id: rev.match_id.clone(), turn: current_turn, result: winner.into(), ai: Some(false) };
                        if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnResult(tr)) { let _ = socket.send(Message::Text(txt)).await; }
                        if p1_score >= 5 || p2_score >= 5 {
                            let winner_id = if p1_score >= 5 { "P1" } else { "P2" };
                            let mr = MatchResult { match_id: rev.match_id, winner: winner_id.into() };
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
