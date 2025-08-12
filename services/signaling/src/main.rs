use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use futures::StreamExt;
use rps_shared_types::{ClientToServer, ServerToClient, Assign as AssignMsg, Peer, RtcConfig, TurnStart, TurnResult, MatchResult, OpponentLeft};
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
    let _http = HttpClient::new();
    let _match_engine = std::env::var("MATCH_ENGINE_HTTP").unwrap_or_else(|_| "http://localhost:8083".to_string());
    let _fairness_http = std::env::var("FAIRNESS_HTTP").unwrap_or_else(|_| "http://localhost:8084".to_string());
    let (tx, mut rx) = mpsc::unbounded_channel::<InternalEvent>();
    let (relay_tx, mut relay_rx) = mpsc::unbounded_channel::<String>();
    let mut match_id_for_session: Option<String> = Some(mid_from_ticket.clone());
    // Parse P1/P2 DIDs from match id if present: format like tid-rX-ENC_P1-ENC_P2 where ':' replaced by '_'
    let (mut p1_did_from_mid, mut p2_did_from_mid): (Option<String>, Option<String>) = (None, None);
    {
        let parts: Vec<&str> = mid_from_ticket.rsplitn(3, '-').collect();
        if parts.len() >= 2 {
            let p2_enc = parts[0];
            let p1_enc = parts[1];
            let p1 = p1_enc.replace('_', ":");
            let p2 = p2_enc.replace('_', ":");
            if p1.starts_with("did:") && p2.starts_with("did:") {
                p1_did_from_mid = Some(p1);
                p2_did_from_mid = Some(p2);
            }
        }
    }
    let turn_deadline_ms: u64 = std::env::var("TURN_DEADLINE_MS").ok().and_then(|s| s.parse().ok()).unwrap_or(30_000);
    tracing::info!(%turn_deadline_ms, "turn deadline configured");
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
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis() as i64;
        let ts_msg = TurnStart { match_id: mid.clone(), turn: t, deadline_ms_epoch: d, now_ms_epoch: now_ms };
        if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnStart(ts_msg)) {
            // broadcast via mailbox (includes this client)
            let peers = { MAILBOXES.lock().unwrap().get(&mid).cloned().unwrap_or_default() };
            for p in peers { let _ = p.send(txt.clone()); }
        }
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
                            let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis() as i64;
                            let turn_start = TurnStart { match_id: mid.clone(), turn: 1, deadline_ms_epoch: deadline, now_ms_epoch: now_ms };
                            if let Ok(txt) = serde_json::to_string(&ServerToClient::TurnStart(turn_start)) {
                                let peers = { MAILBOXES.lock().unwrap().get(&mid).cloned().unwrap_or_default() };
                                for p in peers { let _ = p.send(txt.clone()); }
                            }
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
                        // trust client turn index for consistency across sockets
                        let turn_idx = if rev.turn == 0 { current_turn } else { rev.turn };
                        hasher.update(turn_idx.to_be_bytes());
                        hasher.update(rev.match_id.as_bytes());
                        hasher.update(did.as_bytes());
                        let _commit = hasher.finalize().encode_hex::<String>();
                        // Record user's reveal
                        let mid_now = match_id_for_session.clone().unwrap_or_default();
                        let user_move = rev.move_.chars().next().unwrap_or('R');
                        {
                            let mut all = REVEALS.lock().unwrap();
                            let per_turn = all.entry(mid_now.clone()).or_default();
                            let per_player = per_turn.entry(turn_idx).or_default();
                            per_player.insert(did.clone(), user_move);
                        }
                        // Check if opponent has also revealed for this turn
                        let maybe_opp_move: Option<(String, char)> = {
                            let all = REVEALS.lock().unwrap();
                            all.get(&mid_now)
                                .and_then(|pt| pt.get(&turn_idx))
                                .and_then(|pp| pp.iter().find(|(k, _)| *k.as_str() != did).map(|(k, &m)| (k.clone(), m)))
                        };
                        if let Some((_opp_did, _opp)) = maybe_opp_move {
                            // ensure not already resolved
                            let need_resolve = {
                                let mut resolved = TURN_RESOLVED.lock().unwrap();
                                let key = format!("{}#{}", mid_now, turn_idx);
                                if resolved.contains(&key) { false } else { resolved.insert(key); true }
                            };
                            if !need_resolve { continue; }
                            // Canonical P1/P2 by sorted DIDs and fetch moves per DID
                            let (um, om) = {
                                let parts = PARTICIPANTS.lock().unwrap();
                                let mut v: Vec<String> = parts.get(&mid_now).cloned().unwrap_or_default().into_iter().collect();
                                v.sort();
                                let p1d = p1_did_from_mid.clone().unwrap_or_else(|| v.get(0).cloned().unwrap_or_default());
                                let p2d = p2_did_from_mid.clone().unwrap_or_else(|| v.get(1).cloned().unwrap_or_default());
                                let revs = REVEALS.lock().unwrap();
                                let pt = revs.get(&mid_now).and_then(|pt| pt.get(&turn_idx)).cloned().unwrap_or_default();
                                let m1 = pt.get(&p1d).copied().unwrap_or('R');
                                let m2 = pt.get(&p2d).copied().unwrap_or('R');
                                (m1, m2)
                            };
                            let beats = |a: char, b: char| match (a, b) { ('R','S')|('S','P')|('P','R') => true, _ => false };
                            let winner = if um == om { "DRAW" } else if beats(um, om) { "P1" } else { "P2" };
                            if winner == "P1" { p1_score += 1; } else if winner == "P2" { p2_score += 1; }
                            // Broadcast one canonical result to all peers
                            let tr_all = TurnResult { match_id: mid_now.clone(), turn: turn_idx, result: winner.into(), ai: Some(false), ai_for_dids: Some(vec![]), p1_move: Some(um.to_string()), p2_move: Some(om.to_string()) };
                            if let Ok(txt_all) = serde_json::to_string(&ServerToClient::TurnResult(tr_all)) {
                                // Send to this socket and broadcast via mailbox. Client de-dups.
                                let _ = socket.send(Message::Text(txt_all.clone())).await;
                                let peers = MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default();
                                for p in peers { let _ = p.send(txt_all.clone()); }
                            }
                            // mark this turn resolved to prevent timeout fallback
                            {
                                let mut resolved = TURN_RESOLVED.lock().unwrap();
                                let key = format!("{}#{}", mid_now, turn_idx);
                                resolved.insert(key);
                            }
                            // If someone reached 5 wins, end match now
                            if p1_score >= 5 || p2_score >= 5 {
                                let winner_id = if p1_score >= 5 { "P1" } else { "P2" };
                                let mr = MatchResult { match_id: mid_now.clone(), winner: winner_id.into() };
                                if let Ok(txt) = serde_json::to_string(&ServerToClient::MatchResult(mr)) {
                                    // Send to this socket first so the player who triggered it logs the final win
                                    let _ = socket.send(Message::Text(txt.clone())).await;
                                    let peers = MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default();
                                    for p in peers { let _ = p.send(txt.clone()); }
                                }
                                break;
                            }
                            // Next turn start for both
                            current_turn = turn_idx + 1;
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
                            let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis() as i64;
                            let ts = TurnStart { match_id: mid_now.clone(), turn: current_turn, deadline_ms_epoch: next_deadline, now_ms_epoch: now_ms };
                            if let Ok(txt_ts) = serde_json::to_string(&ServerToClient::TurnStart(ts)) {
                                let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() };
                                for p in peers { let _ = p.send(txt_ts.clone()); }
                            }
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
                // on close, if this match still exists and now <2 participants, notify remaining
                if let Some(mid) = &match_id_for_session {
                    let mut parts = PARTICIPANTS.lock().unwrap();
                    if let Some(set) = parts.get_mut(mid) {
                        set.remove(&did);
                        if set.len() < 2 {
                            let msg = OpponentLeft { match_id: mid.clone() };
                            if let Ok(txt) = serde_json::to_string(&ServerToClient::OpponentLeft(msg)) {
                                let peers = MAILBOXES.lock().unwrap().get(mid).cloned().unwrap_or_default();
                                for p in peers { let _ = p.send(txt.clone()); }
                            }
                        }
                    }
                }
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
                // If we lost a participant before resolution, notify and end match loop
                let parts_count = { PARTICIPANTS.lock().unwrap().get(&mid_now).map(|s| s.len()).unwrap_or(0) };
                if parts_count < 2 {
                    if let Ok(txt) = serde_json::to_string(&ServerToClient::OpponentLeft(OpponentLeft { match_id: mid_now.clone() })) {
                        let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() };
                        for p in peers { let _ = p.send(txt.clone()); }
                    }
                    break;
                }
                let already_resolved = {
                    let resolved = TURN_RESOLVED.lock().unwrap();
                    let key = format!("{}#{}", mid_now, current_turn);
                    resolved.contains(&key)
                };
                if already_resolved { continue; }

                // Determine missing reveals canonically and substitute per missing DID
                let (p1_move_c, p2_move_c, missing_dids) = {
                    let reveals = REVEALS.lock().unwrap();
                    let per_turn = reveals.get(&mid_now).and_then(|pt| pt.get(&current_turn));
                    let parts = PARTICIPANTS.lock().unwrap();
                    let mut ids: Vec<String> = parts.get(&mid_now).cloned().unwrap_or_default().into_iter().collect();
                    ids.sort();
                    let p1d = p1_did_from_mid.clone().unwrap_or_else(|| ids.get(0).cloned().unwrap_or_default());
                    let p2d = p2_did_from_mid.clone().unwrap_or_else(|| ids.get(1).cloned().unwrap_or_default());
                    let rand = |seed: u64| -> char { match seed % 3 { 0 => 'R', 1 => 'P', _ => 'S' } };
                    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis() as u64;
                    let mut miss: Vec<String> = Vec::new();
                    let m1 = per_turn.and_then(|pp| pp.get(&p1d)).copied().unwrap_or_else(|| { miss.push(p1d.clone()); rand(now_ms ^ 0x1111) });
                    let m2 = per_turn.and_then(|pp| pp.get(&p2d)).copied().unwrap_or_else(|| { miss.push(p2d.clone()); rand(now_ms ^ 0x2222) });
                    (m1, m2, miss)
                };
                // Score canonically
                let beats = |a: char, b: char| match (a, b) { ('R','S')|('S','P')|('P','R') => true, _ => false };
                let winner = if p1_move_c == p2_move_c { "DRAW" } else if beats(p1_move_c, p2_move_c) { "P1" } else { "P2" };
                if winner == "P1" { p1_score += 1; } else if winner == "P2" { p2_score += 1; }
                let tr_all = TurnResult { match_id: mid_now.clone(), turn: current_turn, result: winner.into(), ai: Some(!missing_dids.is_empty()), ai_for_dids: Some(missing_dids.clone()), p1_move: Some(p1_move_c.to_string()), p2_move: Some(p2_move_c.to_string()) };
                if let Ok(txt_all) = serde_json::to_string(&ServerToClient::TurnResult(tr_all)) {
                    let _ = socket.send(Message::Text(txt_all.clone())).await;
                    let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() };
                    for p in peers { let _ = p.send(txt_all.clone()); }
                }
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
                let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_millis(0)).as_millis() as i64;
                let ts = TurnStart { match_id: mid_now.clone(), turn: current_turn, deadline_ms_epoch: next_deadline, now_ms_epoch: now_ms };
                if let Ok(txt_ts) = serde_json::to_string(&ServerToClient::TurnStart(ts)) { let peers = { MAILBOXES.lock().unwrap().get(&mid_now).cloned().unwrap_or_default() }; for p in peers { let _ = p.send(txt_ts.clone()); } }
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
        .route("/admin/reset", post(admin_reset))
        .route("/admin/state", get(admin_state))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "signaling listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// --- Admin endpoints ---
#[derive(Debug, serde::Deserialize)]
struct AdminResetReq { match_id: Option<String> }

#[derive(Debug, serde::Serialize)]
struct AdminResetResp { ok: bool, cleared_matches: usize }

async fn admin_reset(axum::Json(req): axum::Json<AdminResetReq>) -> axum::Json<AdminResetResp> {
    if let Some(mid) = req.match_id {
        MAILBOXES.lock().unwrap().remove(&mid);
        REVEALS.lock().unwrap().remove(&mid);
        PARTICIPANTS.lock().unwrap().remove(&mid);
        MATCH_STARTED.lock().unwrap().remove(&mid);
        TURN_STATE.lock().unwrap().remove(&mid);
        // remove any TURN_RESOLVED keys for this mid
        {
            let mut tr = TURN_RESOLVED.lock().unwrap();
            let keys: Vec<String> = tr.iter().filter(|k| k.starts_with(&format!("{}#", mid))).cloned().collect();
            for k in keys { tr.remove(&k); }
        }
        axum::Json(AdminResetResp { ok: true, cleared_matches: 1 })
    } else {
        MAILBOXES.lock().unwrap().clear();
        REVEALS.lock().unwrap().clear();
        PARTICIPANTS.lock().unwrap().clear();
        MATCH_STARTED.lock().unwrap().clear();
        TURN_RESOLVED.lock().unwrap().clear();
        TURN_STATE.lock().unwrap().clear();
        axum::Json(AdminResetResp { ok: true, cleared_matches: 0 })
    }
}

#[derive(Debug, serde::Serialize)]
struct AdminStateResp { matches: usize, participants: usize, pending_turn_states: usize }

async fn admin_state() -> axum::Json<AdminStateResp> {
    let matches = MAILBOXES.lock().unwrap().len();
    let participants: usize = PARTICIPANTS.lock().unwrap().values().map(|s| s.len()).sum();
    let pending_turn_states = TURN_STATE.lock().unwrap().len();
    axum::Json(AdminStateResp { matches, participants, pending_turn_states })
}
