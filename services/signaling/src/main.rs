use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use futures::StreamExt;
use rps_shared_types::{ClientToServer, ServerToClient, Assign as AssignMsg, Peer, RtcConfig, TurnStart, TurnResult, MatchResult};
use sha2::{Digest, Sha256};
use hex::ToHex;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use jsonwebtoken::{DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use reqwest::Client as HttpClient;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tower_http::cors::{CorsLayer, Any};
use std::collections::{HashMap, HashSet};
use once_cell::sync::Lazy;
use std::sync::Mutex;

async fn health() -> &'static str { "ok" }

async fn ws_handler(Query(q): Query<WsAuth>, ws: WebSocketUpgrade) -> axum::response::Response {
    let Some(t) = q.ticket else { return (axum::http::StatusCode::UNAUTHORIZED, "missing ticket").into_response() };
    let Some(claims) = verify_ticket(&t) else { return (axum::http::StatusCode::UNAUTHORIZED, "invalid ticket").into_response() };
    let did = claims.sub.clone();
    let mid = claims.mid.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, did, mid)).into_response()
}

#[derive(Debug, serde::Deserialize)]
struct WsAuth { ticket: Option<String> }

#[derive(Debug, Serialize, Deserialize)]
struct Claims { sub: String, mid: String, exp: usize, iat: usize }

fn verify_ticket(ticket: &str) -> Option<Claims> {
    let key = std::env::var("TICKET_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
    jsonwebtoken::decode::<Claims>(ticket, &DecodingKey::from_secret(key.as_bytes()), &Validation::new(Algorithm::HS256)).ok().map(|d| d.claims)
}

enum InternalEvent { Timeout(u32, String) }

// per-match relay mailboxes (demo only). In production use Redis
static MAILBOXES: Lazy<Mutex<HashMap<String, Vec<mpsc::UnboundedSender<String>>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
// per-match, per-turn reveals: match_id -> turn -> did -> move_char
static REVEALS: Lazy<Mutex<HashMap<String, HashMap<u32, HashMap<String, char>>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
// track participant DIDs per match
static PARTICIPANTS: Lazy<Mutex<HashMap<String, HashSet<String>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
// prevent duplicate turn starts per match
static MATCH_STARTED: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
// prevent double resolution/broadcast of a turn
static TURN_RESOLVED: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
// shared turn state per match: (current_turn, deadline_ms_epoch)
static TURN_STATE: Lazy<Mutex<HashMap<String, (u32, i64)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

async fn handle_socket(mut socket: WebSocket, did: String, mid_from_ticket: String) {
    let mut p1_score: u32 = 0;
    let mut p2_score: u32 = 0;
    let mut current_turn: u32 = 1;
    let http = HttpClient::new();
    let _match_engine = std::env::var("MATCH_ENGINE_HTTP").unwrap_or_else(|_| "http://localhost:8083".to_string());
    let fairness_http = std::env::var("FAIRNESS_HTTP").unwrap_or_else(|_| "http://localhost:8084".to_string());
    let (tx, mut rx) = mpsc::unbounded_channel::<InternalEvent>();
    let (relay_tx, mut relay_rx) = mpsc::unbounded_channel::<String>();
    let mut match_id_for_session: Option<String> = Some(mid_from_ticket.clone());
    let turn_deadline_ms: u64 = std::env::var("TURN_DEADLINE_MS").ok().and_then(|s| s.parse().ok()).unwrap_or(30_000);
    let mut turn_started = false;

    // register this connection to the mailbox for this match
    {
        let mut m = MAILBOXES.lock().unwrap();
        m.entry(mid_from_ticket.clone()).or_default().push(relay_tx);
    }
    // track this connection's DID for this match
    {
        let mut p = PARTICIPANTS.lock().unwrap();
        p.entry(mid_from_ticket.clone()).or_default().insert(did.clone());
    }

    // Initialize or replay current turn/deadline for this match
    if let Some(mid) = match_id_for_session.clone() {
        let (t, d) = {
            let mut ts = TURN_STATE.lock().unwrap();
            if let Some((t, d)) = ts.get(&mid).copied() { (t, d) } else {
                let deadline = SystemTime::now()
                    .checked_add(Duration::from_millis(turn_deadline_ms))
                    .unwrap_or(SystemTime::now())
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or(Duration::from_millis(0))
                    .as_millis() as i64;
                ts.insert(mid.clone(), (1, deadline));
                // schedule timeout once
                let should = { let mut s = MATCH_STARTED.lock().unwrap(); if !s.contains(&mid) { s.insert(mid.clone()); true } else { false } };
                if should {
                    let tx2 = tx.clone(); let mid_clone = mid.clone();
                    tokio::spawn(async move { sleep(Duration::from_millis(turn_deadline_ms)).await; let _ = tx2.send(InternalEvent::Timeout(1, mid_clone)); });
                    turn_started = true;
                }
                (1, deadline)
            }
        };
        current_turn = t;
        let ts_msg = TurnStart { match_id: mid.clone(), turn: t, deadline_ms_epoch: d };
        if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnStart(ts_msg)) { let _ = socket.send(Message::Text(txt)).await; }
    }
    // forward relayed messages to this socket
    // handle socket and relay messages in a single loop to avoid ownership issues
    loop {
        tokio::select! {
            maybe_msg = socket.next() => {
                let Some(res) = maybe_msg else { break };
                let Ok(msg) = res else { break };
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
                        match_id_for_session = Some(assign.match_id.clone());
                        if let Ok(txt) = serde_json::to_string(&ServerToClient::Assign(assign)) { let _ = socket.send(Message::Text(txt)).await; }
                        // NOTE: For full P2P, this handler would relay SDP/ICE between both sides via a mailbox keyed by match_id.
                        // Send TURN_START stub only if we haven't already started based on ticket
                        if !turn_started {
                            let deadline = SystemTime::now()
                                .checked_add(Duration::from_millis(turn_deadline_ms))
                                .unwrap_or(SystemTime::now())
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or(Duration::from_millis(0))
                                .as_millis() as i64;
                            let mid = format!("{}_{}", req.tid, req.round);
                            let turn_start = TurnStart { match_id: mid.clone(), turn: 1, deadline_ms_epoch: deadline };
                            if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnStart(turn_start)) { let _ = socket.send(Message::Text(txt)).await; }
                            // schedule timeout for turn 1
                            let tx2 = tx.clone();
                            let mid_clone = mid.clone();
                            tokio::spawn(async move {
                                sleep(Duration::from_millis(turn_deadline_ms)).await;
                                let _ = tx2.send(InternalEvent::Timeout(1, mid_clone));
                            });
                            turn_started = true;
                        }
                    }
                    // Relay SDP/ICE messages to the opponent via mailbox
                    Ok(ClientToServer::SdpOffer(_off)) => {
                        if let Some(mid) = &match_id_for_session {
                            let txt_clone = txt.clone();
                            let peers = MAILBOXES.lock().unwrap().get(mid).cloned().unwrap_or_default();
                            for p in peers { let _ = p.send(txt_clone.clone()); }
                        }
                    }
                    Ok(ClientToServer::SdpAnswer(_ans)) => {
                        if let Some(mid) = &match_id_for_session {
                            let txt_clone = txt.clone();
                            let peers = MAILBOXES.lock().unwrap().get(mid).cloned().unwrap_or_default();
                            for p in peers { let _ = p.send(txt_clone.clone()); }
                        }
                    }
                    Ok(ClientToServer::Ice(_ice)) => {
                        if let Some(mid) = &match_id_for_session {
                            let txt_clone = txt.clone();
                            let peers = MAILBOXES.lock().unwrap().get(mid).cloned().unwrap_or_default();
                            for p in peers { let _ = p.send(txt_clone.clone()); }
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
                        let _commit = hasher.finalize().encode_hex::<String>();
                        // Record user's reveal
                        let mid_now = match_id_for_session.clone().unwrap_or_default();
                        let user_move = rev.move_.chars().next().unwrap_or('R');
                        {
                            let mut all = REVEALS.lock().unwrap();
                            let per_turn = all.entry(mid_now.clone()).or_default();
                            let per_player = per_turn.entry(current_turn).or_default();
                            per_player.insert(did.clone(), user_move);
                        }
                        // Check if opponent has also revealed for this turn
                        let maybe_opp_move: Option<(String, char)> = {
                            let all = REVEALS.lock().unwrap();
                            all.get(&mid_now)
                                .and_then(|pt| pt.get(&current_turn))
                                .and_then(|pp| pp.iter().find(|(k, _)| *k.as_str() != did).map(|(k, &m)| (k.clone(), m)))
                        };
                        if let Some((opp_did, opp)) = maybe_opp_move {
                            // ensure not already resolved
                            let need_resolve = {
                                let mut resolved = TURN_RESOLVED.lock().unwrap();
                                let key = format!("{}#{}", mid_now, current_turn);
                                if resolved.contains(&key) { false } else { resolved.insert(key); true }
                            };
                            if !need_resolve { continue; }
                            // Canonical P1/P2 by sorted DIDs
                            let (p1_did, p2_did) = {
                                let parts = PARTICIPANTS.lock().unwrap();
                                let mut v: Vec<String> = parts.get(&mid_now).cloned().unwrap_or_default().into_iter().collect();
                                v.sort();
                                let p1 = v.get(0).cloned().unwrap_or_default();
                                let p2 = v.get(1).cloned().unwrap_or_default();
                                (p1, p2)
                            };
                            let um = if did == p1_did { user_move } else { opp };
                            let om = if did == p1_did { opp } else { user_move };
                            let beats = |a: char, b: char| match (a, b) { ('R','S')|('S','P')|('P','R') => true, _ => false };
                            let winner = if um == om { "DRAW" } else if beats(um, om) { "P1" } else { "P2" };
                            if winner == "P1" { p1_score += 1; } else if winner == "P2" { p2_score += 1; }
                            // Broadcast one canonical result to all peers
                            let tr_all = TurnResult { match_id: mid_now.clone(), turn: current_turn, result: winner.into(), ai: Some(false), ai_for_dids: Some(vec![]), p1_move: Some(um.to_string()), p2_move: Some(om.to_string()) };
                            if let Ok(txt_all) = serde_json::to_string(&ServerToClient::TurnResult(tr_all)) {
                                let _ = socket.send(Message::Text(txt_all.clone())).await;
                                let peers = MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default();
                                for p in peers { let _ = p.send(txt_all.clone()); }
                            }
                            // Next turn start for both
                            current_turn += 1;
                            let next_deadline = SystemTime::now()
                                .checked_add(Duration::from_millis(turn_deadline_ms))
                                .unwrap_or(SystemTime::now())
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or(Duration::from_millis(0))
                                .as_millis() as i64;
                            {
                                let mut ts_map = TURN_STATE.lock().unwrap();
                                ts_map.insert(mid_now.clone(), (current_turn, next_deadline));
                            }
                            let ts = TurnStart { match_id: mid_now.clone(), turn: current_turn, deadline_ms_epoch: next_deadline };
                            if let Ok(txt_ts) = serde_json::to_string(&ServerToClient::TurnStart(ts)) { let _ = socket.send(Message::Text(txt_ts.clone())).await; let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() }; for p in peers { let _ = p.send(txt_ts.clone()); } }
                            // schedule next turn timeout always
                            let tx2 = tx.clone();
                            let mid_clone = mid_now.clone();
                            let next_turn = current_turn;
                            tokio::spawn(async move {
                                sleep(Duration::from_millis(turn_deadline_ms)).await;
                                let _ = tx2.send(InternalEvent::Timeout(next_turn, mid_clone));
                            });
                        }
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
            // relay messages destined to this client
            Some(relay_txt) = relay_rx.recv() => {
                let _ = socket.send(Message::Text(relay_txt)).await;
            }
            // Handle internal timeout events
            Some(evt) = rx.recv() => {
                let InternalEvent::Timeout(tn, mid_now) = evt;
                if tn != current_turn { continue; }
                // ensure not already resolved
                let already_resolved = {
                    let resolved = TURN_RESOLVED.lock().unwrap();
                    let key = format!("{}#{}", mid_now, current_turn);
                    resolved.contains(&key)
                };
                if already_resolved { continue; }

                // Determine missing reveals for known participants and substitute per missing DID
                let (user_move, opp_move, missing_dids, opp_did) = {
                    let reveals = REVEALS.lock().unwrap();
                    let per_turn = reveals.get(&mid_now).and_then(|pt| pt.get(&current_turn));
                    let parts = PARTICIPANTS.lock().unwrap();
                    let set = parts.get(&mid_now).cloned().unwrap_or_default();
                    let opp_did = set.iter().find(|d2| *d2 != &did).cloned().unwrap_or_else(|| "PEER".to_string());
                    let mut missing: Vec<String> = Vec::new();
                    let rand = |seed: u64| -> char { match seed % 3 { 0 => 'R', 1 => 'P', _ => 'S' } };
                    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis() as u64;
                    let um = per_turn.and_then(|pp| pp.get(&did)).copied().unwrap_or_else(|| { missing.push(did.clone()); rand(now_ms ^ 0x1111) });
                    let om = per_turn.and_then(|pp| pp.get(&opp_did)).copied().unwrap_or_else(|| { missing.push(opp_did.clone()); rand(now_ms ^ 0x2222) });
                    (um, om, missing, opp_did)
                };
                // Compute winner from this user's perspective and broadcast mirrored
                let beats = |a: char, b: char| match (a, b) { ('R','S')|('S','P')|('P','R') => true, _ => false };
                let winner_user = if user_move == opp_move { "DRAW" } else if beats(user_move, opp_move) { "P1" } else { "P2" };
                if winner_user == "P1" { p1_score += 1; } else if winner_user == "P2" { p2_score += 1; }
                let tr_user = TurnResult { match_id: mid_now.clone(), turn: current_turn, result: winner_user.into(), ai: Some(missing_dids.iter().any(|d| d == &did)), ai_for_dids: Some(missing_dids.clone()), p1_move: Some(user_move.to_string()), p2_move: Some(opp_move.to_string()) };
                if let Ok(txtu) = serde_json::to_string(&ServerToClient::TurnResult(tr_user)) { let _ = socket.send(Message::Text(txtu)).await; }
                let winner_peer = match winner_user { "P1" => "P2", "P2" => "P1", _ => "DRAW" };
                let tr_peer = TurnResult { match_id: mid_now.clone(), turn: current_turn, result: winner_peer.into(), ai: Some(missing_dids.iter().any(|d| d == &opp_did)), ai_for_dids: Some(missing_dids.clone()), p1_move: Some(user_move.to_string()), p2_move: Some(opp_move.to_string()) };
                if let Ok(txtp) = serde_json::to_string(&ServerToClient::TurnResult(tr_peer)) { let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() }; for p in peers { let _ = p.send(txtp.clone()); } }
                {
                    let mut resolved = TURN_RESOLVED.lock().unwrap();
                    let key = format!("{}#{}", mid_now, current_turn);
                    resolved.insert(key);
                }
                if p1_score >= 5 || p2_score >= 5 {
                    let winner_id = if p1_score >= 5 { "P1" } else { "P2" };
                    let mr = MatchResult { match_id: mid_now.clone(), winner: winner_id.into() };
                    if let Ok(txt) = serde_json::to_string(&ServerToClient::MatchResult(mr)) { let _ = socket.send(Message::Text(txt.clone())).await; let peers = MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default(); for p in peers { let _ = p.send(txt.clone()); } }
                    break;
                }
                current_turn += 1;
                // start next turn for both
                let next_deadline = SystemTime::now()
                    .checked_add(Duration::from_millis(turn_deadline_ms))
                    .unwrap_or(SystemTime::now())
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or(Duration::from_millis(0))
                    .as_millis() as i64;
                {
                    let mut ts = TURN_STATE.lock().unwrap();
                    ts.insert(mid_now.clone(), (current_turn, next_deadline));
                }
                let ts = TurnStart { match_id: mid_now.clone(), turn: current_turn, deadline_ms_epoch: next_deadline };
                if let Ok(txt_ts) = serde_json::to_string(&ServerToClient::TurnStart(ts)) { let _ = socket.send(Message::Text(txt_ts.clone())).await; let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() }; for p in peers { let _ = p.send(txt_ts.clone()); } }
                // schedule next timeout
                let tx2 = tx.clone();
                let mid_clone = mid_now.clone();
                let next_turn = current_turn;
                tokio::spawn(async move {
                    sleep(Duration::from_millis(turn_deadline_ms)).await;
                    let _ = tx2.send(InternalEvent::Timeout(next_turn, mid_clone));
                });
            }
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(health))
        .route("/ws", get(ws_handler))
        .route("/ready", post(|| async { "ok" }))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "signaling listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
