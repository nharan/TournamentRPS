use axum::{routing::{get, post}, Router, Json, extract::Query};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use serde::{Deserialize, Serialize};
use jsonwebtoken::{encode, Header, EncodingKey};
use chrono::{Utc, Duration};
use reqwest::Client as HttpClient;
use tower_http::cors::{CorsLayer, Any};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::time::Instant;

#[derive(Debug, Deserialize)]
struct TicketRequest { did: String, match_id: String }

#[derive(Debug, Serialize, Deserialize)]
struct Claims { sub: String, mid: String, exp: usize, iat: usize }

/// Issues a short‑lived JWT "ticket" for a specific DID and match id.
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

/// Demo pairing: forms a deterministic match id and issues a READY assignment
/// along with a ticket. Also posts a stub round anchor to the writer service.
async fn ready_for_round(Json(req): Json<ReadyForRoundReq>) -> Json<ReadyForRoundResp> {
    // Deterministic stub match id and role for MVP
    let match_id = format!("{}-r{}-{}", req.tid, req.round, &req.did);
    let ticket = issue_jwt(&req.did, &match_id);
    // Post round anchor stub to atproto-writer
    let atw = std::env::var("ATPROTO_WRITER_HTTP").unwrap_or_else(|_| "http://localhost:8085".to_string());
    let _ = HttpClient::new().post(format!("{}/round_anchor", atw))
        .json(&serde_json::json!({
            "tid": req.tid,
            "round": req.round,
            "aliveRoot": "0x00",
            "pairingSeed": "0x00",
            "merkleRoot": "0x00",
            "postedAt": Utc::now().to_rfc3339(),
        }))
        .send().await;
    let resp = ReadyForRoundResp {
        match_id,
        role: "P1".into(),
        peer: serde_json::json!({"did":"AI","handle":"AI_BYE"}),
        ticket,
    };
    Json(resp)
}

/// Helper to mint HS256 JWT for a participant DID and match id.
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

/// Service entrypoint: HTTP routes for tickets, queue, tournament, admin.
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ticket", post(issue_ticket))
        .route("/ready_for_round", post(ready_for_round))
        .route("/queue_ready", post(queue_ready))
        .route("/queue_cancel", post(queue_cancel))
        .route("/register", post(register))
        .route("/start_round", post(start_round))
        .route("/assignment", get(assignment))
        .route("/admin/reset", post(admin_reset))
        .route("/admin/state", get(admin_state))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// --- Simple in-memory pairing queue (demo only) ---
// Track waiting DID with timestamp to avoid ghosts
static WAITING: Lazy<Mutex<Option<(String, Instant)>>> = Lazy::new(|| Mutex::new(None));
static ASSIGNMENTS: Lazy<Mutex<std::collections::HashMap<String, ReadyForRoundResp>>> = Lazy::new(|| Mutex::new(std::collections::HashMap::new()));
// Track assignment insertion time for TTL pruning
static ASSIGNMENT_TS: Lazy<Mutex<std::collections::HashMap<String, Instant>>> = Lazy::new(|| Mutex::new(std::collections::HashMap::new()));
static ENTRANTS: Lazy<Mutex<std::collections::HashMap<String, Vec<String>>>> = Lazy::new(|| Mutex::new(std::collections::HashMap::new()));
static HANDLES: Lazy<Mutex<std::collections::HashMap<String, String>>> = Lazy::new(|| Mutex::new(std::collections::HashMap::new()));

#[derive(Debug, Deserialize)]
struct QueueReadyReq { tid: String, did: String, handle: Option<String>, ai_if_alone: Option<bool> }

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
enum QueueReadyResp {
    WAIT,
    ASSIGN { match_id: String, role: String, peer: serde_json::Value, ticket: String },
}

/// Simple in‑memory pairing queue. Returns WAIT until a second player arrives,
/// then emits an ASSIGN for both.
async fn queue_ready(Json(req): Json<QueueReadyReq>) -> Json<QueueReadyResp> {
    // Record/refresh handle if provided (normal mode sign-in path)
    if let Some(h) = req.handle.as_ref() { HANDLES.lock().unwrap().insert(req.did.clone(), h.clone()); }
    // Check if there is an assignment prepared for this DID
    if let Some(a) = ASSIGNMENTS.lock().unwrap().remove(&req.did) {
        return Json(QueueReadyResp::ASSIGN { match_id: a.match_id, role: a.role, peer: a.peer, ticket: a.ticket });
    }
    let mut w = WAITING.lock().unwrap();
    if let Some((other, _since)) = w.take() {
        // If the other waiting DID is the same as this requester, keep waiting
        if other == req.did {
            *w = Some((other, Instant::now()));
            return Json(QueueReadyResp::WAIT);
        }
        // Pair other with this did (canonical p1/p2 by sort for match_id stability)
        let (p1, p2) = if other < req.did { (other.clone(), req.did.clone()) } else { (req.did.clone(), other.clone()) };
        let match_id = format!("{}-{}-{}", req.tid, p1.replace(':',"_"), p2.replace(':',"_"));
        let t1 = issue_jwt(&p1, &match_id);
        let t2 = issue_jwt(&p2, &match_id);
        // Determine handles if known
        let (p1h, p2h) = {
            let h = HANDLES.lock().unwrap();
            (h.get(&p1).cloned().unwrap_or_else(|| "unknown".into()), h.get(&p2).cloned().unwrap_or_else(|| "unknown".into()))
        };
        // Prepare assignment for the waiting player ("other") with the correct role and ticket
        if other == p1 {
            ASSIGNMENTS.lock().unwrap().insert(other.clone(), ReadyForRoundResp {
                match_id: match_id.clone(),
                role: "P1".into(),
                peer: serde_json::json!({"did": p2, "handle": p2h}),
                ticket: t1,
            });
            ASSIGNMENT_TS.lock().unwrap().insert(other.clone(), Instant::now());
            // Return assignment for current requester as P2
            let resp = QueueReadyResp::ASSIGN { match_id, role: "P2".into(), peer: serde_json::json!({"did": p1, "handle": p1h}), ticket: t2 };
            return Json(resp);
        } else {
            ASSIGNMENTS.lock().unwrap().insert(other.clone(), ReadyForRoundResp {
                match_id: match_id.clone(),
                role: "P2".into(),
                peer: serde_json::json!({"did": p1, "handle": p1h}),
                ticket: t2,
            });
            ASSIGNMENT_TS.lock().unwrap().insert(other.clone(), Instant::now());
            // Return assignment for current requester as P1
            let resp = QueueReadyResp::ASSIGN { match_id, role: "P1".into(), peer: serde_json::json!({"did": p2, "handle": p2h}), ticket: t1 };
            return Json(resp);
        }
    } else {
        // Normal play mode (no AI auto-fill): wait for a peer
        *w = Some((req.did, Instant::now()));
        return Json(QueueReadyResp::WAIT);
    }
}

#[derive(Debug, Deserialize)]
struct QueueCancelReq { did: String }

#[derive(Debug, Serialize)]
struct QueueCancelResp { ok: bool, removed: bool }

/// Allows a client to cancel their waiting status in the simple pairing queue.
async fn queue_cancel(Json(req): Json<QueueCancelReq>) -> Json<QueueCancelResp> {
    // Remove from WAITING if present
    let mut removed = false;
    {
        let mut w = WAITING.lock().unwrap();
        if let Some((cur, _)) = &*w {
            if *cur == req.did { *w = None; removed = true; }
        }
    }
    // Also clear any prepared assignment for this DID
    ASSIGNMENTS.lock().unwrap().remove(&req.did);
    ASSIGNMENT_TS.lock().unwrap().remove(&req.did);
    Json(QueueCancelResp { ok: true, removed })
}

// --- Registration & tournament start ---
#[derive(Debug, Deserialize)]
struct RegisterReq { tid: String, did: String, handle: Option<String> }

#[derive(Debug, Serialize)]
struct RegisterResp { ok: bool }

/// Records a DID for a tournament id (tid) and stores handle if provided.
async fn register(Json(req): Json<RegisterReq>) -> Json<RegisterResp> {
    let mut e = ENTRANTS.lock().unwrap();
    let list = e.entry(req.tid).or_default();
    let did_clone = req.did.clone();
    if !list.iter().any(|d| d == &req.did) { list.push(req.did.clone()); }
    if let Some(h) = req.handle { HANDLES.lock().unwrap().insert(did_clone, h); }
    Json(RegisterResp { ok: true })
}

#[derive(Debug, Deserialize)]
struct StartRoundReq { tid: String, round: u32 }

#[derive(Debug, Serialize)]
struct StartRoundResp { ok: bool, pairs: usize }

/// Creates deterministic P1/P2 assignments for entrants of a given tid/round.
async fn start_round(Json(req): Json<StartRoundReq>) -> Json<StartRoundResp> {
    let mut e = ENTRANTS.lock().unwrap();
    let mut list = e.remove(&req.tid).unwrap_or_default();
    list.sort();
    let mut i = 0usize; let mut pairs = 0usize;
    while i + 1 <= list.len() {
        let p1 = list.get(i).cloned(); i += 1;
        if let Some(p1did) = p1 {
            if i < list.len() {
                let p2did = list[i].clone(); i += 1;
                let mid = format!("{}-r{}-{}-{}", req.tid, req.round, p1did.replace(':',"_"), p2did.replace(':',"_"));
                let t1 = issue_jwt(&p1did, &mid);
                let t2 = issue_jwt(&p2did, &mid);
                let h = HANDLES.lock().unwrap();
                let p1h = h.get(&p1did).cloned().unwrap_or_else(|| "unknown".into());
                let p2h = h.get(&p2did).cloned().unwrap_or_else(|| "unknown".into());
                ASSIGNMENTS.lock().unwrap().insert(p1did.clone(), ReadyForRoundResp { match_id: mid.clone(), role: "P1".into(), peer: serde_json::json!({"did": p2did, "handle": p2h}), ticket: t1 });
                ASSIGNMENTS.lock().unwrap().insert(p2did.clone(), ReadyForRoundResp { match_id: mid.clone(), role: "P2".into(), peer: serde_json::json!({"did": p1did, "handle": p1h}), ticket: t2 });
                pairs += 1;
            } else {
                // odd -> AI seat
                let mid = format!("{}-r{}-{}-AI", req.tid, req.round, p1did.replace(':',"_"));
                let t1 = issue_jwt(&p1did, &mid);
                ASSIGNMENTS.lock().unwrap().insert(p1did.clone(), ReadyForRoundResp { match_id: mid.clone(), role: "P1".into(), peer: serde_json::json!({"did": "AI", "handle": "AI_BYE"}), ticket: t1 });
            }
        }
    }
    Json(StartRoundResp { ok: true, pairs })
}

#[derive(Debug, Deserialize)]
struct AssignmentQuery { tid: String, did: String }

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
enum AssignmentResp { WAIT, ASSIGN { match_id: String, role: String, peer: serde_json::Value, ticket: String } }

/// Polls for a prepared assignment for the given DID. Returns WAIT if none.
async fn assignment(Query(q): Query<AssignmentQuery>) -> Json<AssignmentResp> {
    if let Some(a) = ASSIGNMENTS.lock().unwrap().remove(&q.did) {
        Json(AssignmentResp::ASSIGN { match_id: a.match_id, role: a.role, peer: a.peer, ticket: a.ticket })
    } else {
        Json(AssignmentResp::WAIT)
    }
}

// --- Admin: reset and state ---
#[derive(Debug, Deserialize)]
struct AdminResetReq { tid: Option<String> }

#[derive(Debug, Serialize)]
struct AdminResetResp { ok: bool, cleared_dids: usize, cleared_pairs: usize }

/// Admin: clears entrants/handles/assignments for a tid, or wipes all if none.
async fn admin_reset(Json(req): Json<AdminResetReq>) -> Json<AdminResetResp> {
    // Collect DIDs to clear if tid provided
    let mut cleared_dids = 0usize;
    if let Some(tid) = req.tid {
        let dids: Vec<String> = {
            let mut e = ENTRANTS.lock().unwrap();
            e.remove(&tid).unwrap_or_default()
        };
        cleared_dids = dids.len();
        // Clear assignments for these DIDs
        if !dids.is_empty() {
            let mut a = ASSIGNMENTS.lock().unwrap();
            for d in &dids { a.remove(d); }
        }
        // Clear handles for these DIDs
        if !dids.is_empty() {
            let mut h = HANDLES.lock().unwrap();
            for d in &dids { h.remove(d); }
        }
        // If waiting contains one of these DIDs, clear it
        {
            let mut w = WAITING.lock().unwrap();
            if let Some((cur, _)) = &*w { if dids.iter().any(|d| d == cur) { *w = None; } }
        }
    } else {
        // Full wipe
        ENTRANTS.lock().unwrap().clear();
        HANDLES.lock().unwrap().clear();
        ASSIGNMENTS.lock().unwrap().clear();
        *WAITING.lock().unwrap() = None;
    }
    // pairs cleared is approximate: number of assignment entries removed in this call
    let cleared_pairs = cleared_dids / 2;
    Json(AdminResetResp { ok: true, cleared_dids, cleared_pairs })
}

#[derive(Debug, Serialize)]
struct AdminStateResp {
    entrants_tids: usize,
    total_entrants: usize,
    waiting_present: bool,
    assignments: usize,
    handles: usize,
}

/// Admin: returns counts of entrants, waiting flag, assignments, and handles.
async fn admin_state() -> Json<AdminStateResp> {
    let entrants_tids = ENTRANTS.lock().unwrap().len();
    let total_entrants: usize = ENTRANTS
        .lock()
        .unwrap()
        .values()
        .map(|v| v.len())
        .sum();
    let waiting_present = WAITING.lock().unwrap().is_some();
    let assignments = ASSIGNMENTS.lock().unwrap().len();
    let handles = HANDLES.lock().unwrap().len();
    Json(AdminStateResp { entrants_tids, total_entrants, waiting_present, assignments, handles })
}
