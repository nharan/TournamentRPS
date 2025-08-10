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
        .route("/ready_for_round", post(ready_for_round))
        .route("/queue_ready", post(queue_ready))
        .route("/register", post(register))
        .route("/start_round", post(start_round))
        .route("/assignment", get(assignment))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "listening");
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// --- Simple in-memory pairing queue (demo only) ---
static WAITING: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
static ASSIGNMENTS: Lazy<Mutex<std::collections::HashMap<String, ReadyForRoundResp>>> = Lazy::new(|| Mutex::new(std::collections::HashMap::new()));
static ENTRANTS: Lazy<Mutex<std::collections::HashMap<String, Vec<String>>>> = Lazy::new(|| Mutex::new(std::collections::HashMap::new()));

#[derive(Debug, Deserialize)]
struct QueueReadyReq { tid: String, did: String }

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
enum QueueReadyResp {
    WAIT,
    ASSIGN { match_id: String, role: String, peer: serde_json::Value, ticket: String },
}

async fn queue_ready(Json(req): Json<QueueReadyReq>) -> Json<QueueReadyResp> {
    // Check if there is an assignment prepared for this DID
    if let Some(a) = ASSIGNMENTS.lock().unwrap().remove(&req.did) {
        return Json(QueueReadyResp::ASSIGN { match_id: a.match_id, role: a.role, peer: a.peer, ticket: a.ticket });
    }
    let mut w = WAITING.lock().unwrap();
    if let Some(other) = w.take() {
        // Pair other with this did
        let (p1, p2) = if other < req.did { (other, req.did.clone()) } else { (req.did.clone(), other) };
        let match_id = format!("{}-{}-{}", req.tid, p1.replace(':',"_"), p2.replace(':',"_"));
        let t1 = issue_jwt(&p1, &match_id);
        let t2 = issue_jwt(&p2, &match_id);
        // Prepare assignment for the other player
        ASSIGNMENTS.lock().unwrap().insert(p1.clone(), ReadyForRoundResp { match_id: match_id.clone(), role: "P1".into(), peer: serde_json::json!({"did": p2, "handle": "peer"}), ticket: t1 });
        // Return assignment for current player
        let resp = QueueReadyResp::ASSIGN { match_id, role: "P2".into(), peer: serde_json::json!({"did": p1, "handle": "peer"}), ticket: t2 };
        return Json(resp);
    } else {
        *w = Some(req.did);
        return Json(QueueReadyResp::WAIT);
    }
}

// --- Registration & tournament start ---
#[derive(Debug, Deserialize)]
struct RegisterReq { tid: String, did: String }

#[derive(Debug, Serialize)]
struct RegisterResp { ok: bool }

async fn register(Json(req): Json<RegisterReq>) -> Json<RegisterResp> {
    let mut e = ENTRANTS.lock().unwrap();
    let list = e.entry(req.tid).or_default();
    if !list.iter().any(|d| d == &req.did) { list.push(req.did); }
    Json(RegisterResp { ok: true })
}

#[derive(Debug, Deserialize)]
struct StartRoundReq { tid: String, round: u32 }

#[derive(Debug, Serialize)]
struct StartRoundResp { ok: bool, pairs: usize }

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
                ASSIGNMENTS.lock().unwrap().insert(p1did.clone(), ReadyForRoundResp { match_id: mid.clone(), role: "P1".into(), peer: serde_json::json!({"did": p2did}), ticket: t1 });
                ASSIGNMENTS.lock().unwrap().insert(p2did.clone(), ReadyForRoundResp { match_id: mid.clone(), role: "P2".into(), peer: serde_json::json!({"did": p1did}), ticket: t2 });
                pairs += 1;
            } else {
                // odd -> AI seat
                let mid = format!("{}-r{}-{}-AI", req.tid, req.round, p1did.replace(':',"_"));
                let t1 = issue_jwt(&p1did, &mid);
                ASSIGNMENTS.lock().unwrap().insert(p1did.clone(), ReadyForRoundResp { match_id: mid.clone(), role: "P1".into(), peer: serde_json::json!({"did": "AI"}), ticket: t1 });
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

async fn assignment(Query(q): Query<AssignmentQuery>) -> Json<AssignmentResp> {
    if let Some(a) = ASSIGNMENTS.lock().unwrap().remove(&q.did) {
        Json(AssignmentResp::ASSIGN { match_id: a.match_id, role: a.role, peer: a.peer, ticket: a.ticket })
    } else {
        Json(AssignmentResp::WAIT)
    }
}
