use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assign {
  pub match_id: String,
  pub role: String,
  pub peer: Peer,
  pub rtc: RtcConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Peer { pub did: String, pub handle: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtcConfig { pub turns: Vec<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnStart {
  pub match_id: String,
  pub turn: u32,
  pub deadline_ms_epoch: i64,
  // Server current time in ms epoch when the event was created; clients can compute offset
  pub now_ms_epoch: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnResult {
  pub match_id: String,
  pub turn: u32,
  pub result: String,
  // retained for backward-compat with older clients
  pub ai: Option<bool>,
  // which player(s) were AI-substituted this turn (DIDs). Empty or None means no substitution.
  pub ai_for_dids: Option<Vec<String>>,
  // optional: canonical moves by role
  pub p1_move: Option<String>,
  pub p2_move: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult { pub match_id: String, pub winner: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorMsg { pub code: String, pub msg: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerToClient {
  Assign(Assign),
  TurnStart(TurnStart),
  TurnResult(TurnResult),
  MatchResult(MatchResult),
  Error(ErrorMsg),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadyForRound { pub tid: String, pub round: u32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Heartbeat {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdpOffer { pub match_id: String, pub sdp: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdpAnswer { pub match_id: String, pub sdp: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ice { pub match_id: String, pub candidate: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitHashes { pub match_id: String, pub hashes: [String; 32] }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reveal { pub match_id: String, pub turn: u32, pub move_: String, pub nonce: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientToServer {
  ReadyForRound(ReadyForRound),
  Heartbeat(Heartbeat),
  SdpOffer(SdpOffer),
  SdpAnswer(SdpAnswer),
  Ice(Ice),
  CommitHashes(CommitHashes),
  Reveal(Reveal),
}
