use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use std::time::Duration;
use tokio::{time::{sleep, timeout}};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Clone)]
struct SimConfig {
    coord: String,
    signal_ws: String,
    tid: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Role { P1, P2 }

#[derive(Clone)]
struct AssignInfo { match_id: String, ticket: String, role: Role }

async fn queue_until_assigned(http: &Client, name: &str, did: &str, cfg: &SimConfig) -> Result<AssignInfo> {
    let mut ticket = String::new();
    let mut match_id = String::new();
    let mut role: Option<Role> = None;
    let overall = Duration::from_secs(20);
    let start = std::time::Instant::now();
    while start.elapsed() < overall {
        let res = http
            .post(format!("{}/queue_ready", cfg.coord))
            .json(&serde_json::json!({"tid": cfg.tid, "did": did, "handle": name}))
            .send()
            .await
            .with_context(|| "queue_ready request failed")?;
        let j: serde_json::Value = res.json().await.with_context(|| "queue_ready decode failed")?;
        if j["status"] == "ASSIGN" {
            ticket = j["ticket"].as_str().unwrap_or_default().to_string();
            match_id = j["match_id"].as_str().unwrap_or_default().to_string();
            let r = j["role"].as_str().unwrap_or("");
            role = Some(match r { "P1" => Role::P1, "P2" => Role::P2, _ => return Err(anyhow!("missing role in ASSIGN")) });
            break;
        }
        sleep(Duration::from_millis(200)).await;
    }
    if ticket.is_empty() { return Err(anyhow!("{} queue timeout", name)); }
    Ok(AssignInfo { match_id, ticket, role: role.unwrap() })
}

async fn run_player(name: &str, cfg: SimConfig, planned_moves: &[(&'static str, &'static str)], preassign: Option<AssignInfo>) -> Result<()> {
    let http = Client::new();
    let did = format!("did:plc:{}", name);
    let AssignInfo { match_id, ticket, role } = if let Some(a) = preassign { a } else { queue_until_assigned(&http, name, &did, &cfg).await? };
    let verbose = std::env::var("SIM_VERBOSE").ok().map(|v| v == "1").unwrap_or(false);
    if verbose { println!("{} assigned: role={:?}", name, role); }

    // connect ws
    let url = format!("{}?ticket={}", cfg.signal_ws, urlencoding::encode(&ticket));
    let (mut ws, _resp) = connect_async(&url).await.with_context(|| "ws connect failed")?;
    if verbose { println!("{} connected", name); }

    // Play deterministic turns from planned_moves. planned_moves is a list of (move_for_P1, move_for_P2)
    // Fast-fail timeouts: 12s per TURN_RESULT wait (covers assign/connect jitter)
    let per_phase = Duration::from_secs(12);
    for (turn_idx, (p1_mv, p2_mv)) in planned_moves.iter().enumerate() {
        // Wait for TURN_START for next observed turn (do not assume it is 1 + index)
        let observed_turn: u32 = loop {
            let msg = timeout(per_phase, ws.next()).await.context("TURN_START timeout")?
                .ok_or_else(|| anyhow!("ws stream closed"))?;
            let msg = msg.context("ws error frame")?;
            if let Message::Text(txt) = msg {
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&txt) {
                    if j["type"] == "TURN_START" {
                        let t = j["turn"].as_u64().unwrap_or(0) as u32;
                        if verbose { println!("{} TURN_START turn={} (script idx {})", name, t, turn_idx+1); }
                        break t;
                    }
                }
            }
        };
        // Send reveal for this observed turn based on our role
        let mv = match role { Role::P1 => *p1_mv, Role::P2 => *p2_mv };
        if verbose { println!("{} REVEAL turn={} move={}", name, observed_turn, mv); }
        let reveal = serde_json::json!({
            "type":"REVEAL",
            "match_id": match_id,
            "turn": observed_turn,
            "move_": mv,
            "nonce": format!("n{}{}", name, observed_turn)
        }).to_string();
        ws.send(Message::Text(reveal)).await.context("send reveal failed")?;

        // Wait for TURN_RESULT of this turn and validate winner when not DRAW
        loop {
            let msg = timeout(per_phase, ws.next()).await.context("TURN_RESULT timeout")?
                .ok_or_else(|| anyhow!("ws stream closed"))?;
            let msg = msg.context("ws error frame")?;
            if let Message::Text(txt) = msg {
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&txt) {
                    if j["type"] == "TURN_RESULT" {
                        let t = j["turn"].as_u64().unwrap_or(0) as u32;
                        if t != observed_turn { continue; }
                        let result = j["result"].as_str().unwrap_or("");
                        // Compute expected result
                        let expected = expected_winner(*p1_mv, *p2_mv);
                        if verbose { println!("{} TURN_RESULT turn={} got={} expected={:?}", name, t, result, expected); }
                        match expected {
                            Some(Role::P1) => if result != "P1" { return Err(anyhow!("expected P1 win on turn {} ({} vs {}), got {}", observed_turn, p1_mv, p2_mv, result)); },
                            Some(Role::P2) => if result != "P2" { return Err(anyhow!("expected P2 win on turn {} ({} vs {}), got {}", observed_turn, p1_mv, p2_mv, result)); },
                            None => if result != "DRAW" { return Err(anyhow!("expected DRAW on turn {} ({} vs {}), got {}", observed_turn, p1_mv, p2_mv, result)); },
                        }
                        break;
                    } else if j["type"] == "OPPONENT_LEFT" {
                        return Err(anyhow!("opponent left before resolution on turn {}", observed_turn));
                    }
                }
            }
        }
    }
    // graceful close
    let _ = ws.send(Message::Close(None)).await;
    if verbose { println!("{} done", name); }
    Ok(())
}

fn expected_winner(p1: &str, p2: &str) -> Option<Role> {
    // Returns Some(winner_role) or None for draw
    match (p1, p2) {
        ("R", "S") | ("S", "P") | ("P", "R") => Some(Role::P1),
        ("S", "R") | ("P", "S") | ("R", "P") => Some(Role::P2),
        _ => None,
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();
    let cfg = SimConfig {
        coord: std::env::var("COORD").unwrap_or_else(|_| "http://localhost:8082".into()),
        signal_ws: std::env::var("SIG").unwrap_or_else(|_| "ws://localhost:8081/ws".into()),
        tid: "demo".into(),
    };
    // Deterministic 2-player fast-fail test
    let planned: [(&'static str, &'static str); 3] = [("R", "S"), ("P", "R"), ("S", "P")]; // P1 should win all 3
    // Optional direct ticketing to avoid queue interference
    let sim_direct = std::env::var("SIM_DIRECT").ok().map(|v| v == "1").unwrap_or(false);
    let (p1_pre, p2_pre) = if sim_direct {
        let http = Client::new();
        let did_a = "did:plc:simA".to_string();
        let did_b = "did:plc:simB".to_string();
        let (p1d, p2d) = if did_a < did_b { (did_a.clone(), did_b.clone()) } else { (did_b.clone(), did_a.clone()) };
        let mid = format!("{}-{}-{}", cfg.tid, p1d.replace(":","_"), p2d.replace(":","_"));
        let t1: String = http.post(format!("{}/ticket", cfg.coord)).json(&serde_json::json!({"did": p1d, "match_id": mid})).send().await?.json::<serde_json::Value>().await?.get("ticket").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let t2: String = http.post(format!("{}/ticket", cfg.coord)).json(&serde_json::json!({"did": p2d, "match_id": mid})).send().await?.json::<serde_json::Value>().await?.get("ticket").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let a1 = AssignInfo { match_id: mid.clone(), ticket: t1, role: Role::P1 };
        let a2 = AssignInfo { match_id: mid.clone(), ticket: t2, role: Role::P2 };
        (Some(a1), Some(a2))
    } else { (None, None) };

    let p1 = {
        let cfgc = cfg.clone();
        let pre = p1_pre.clone();
        tokio::spawn(async move { run_player("simA", cfgc, &planned, pre).await })
    };
    // Small gap - larger to avoid init races
    sleep(Duration::from_millis(800)).await;
    let p2 = {
        let cfgc = cfg.clone();
        let pre = p2_pre.clone();
        tokio::spawn(async move { run_player("simB", cfgc, &planned, pre).await })
    };

    // Global timeout for the test
    let overall = Duration::from_secs(30);
    let (r1, r2) = tokio::try_join!(timeout(overall, p1), timeout(overall, p2))
        .map_err(|_| anyhow!("test overall timeout"))?;
    r1.map_err(|e| anyhow!("p1 task join error: {}", e))??;
    r2.map_err(|e| anyhow!("p2 task join error: {}", e))??;
    Ok(())
}


