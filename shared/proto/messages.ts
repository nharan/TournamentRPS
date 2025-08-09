export type ReadyForRound = { tid: string; round: number };
export type Heartbeat = {};
export type SdpOffer = { matchId: string; sdp: string };
export type SdpAnswer = { matchId: string; sdp: string };
export type Ice = { matchId: string; candidate: string };
export type CommitHashes = { matchId: string; hashes: string[] };
export type Reveal = { matchId: string; turn: number; move: 'R'|'P'|'S'; nonce: string };

export type ClientToServer =
  | { type: 'READY_FOR_ROUND'; data: ReadyForRound }
  | { type: 'HEARTBEAT'; data: Heartbeat }
  | { type: 'SDP_OFFER'; data: SdpOffer }
  | { type: 'SDP_ANSWER'; data: SdpAnswer }
  | { type: 'ICE'; data: Ice }
  | { type: 'COMMIT_HASHES'; data: CommitHashes }
  | { type: 'REVEAL'; data: Reveal };

export type Assign = { matchId: string; role: 'P1'|'P2'; peer: { did: string; handle: string }; rtc: { turns: string[] } };
export type TurnStart = { matchId: string; turn: number; deadlineMsEpoch: number };
export type TurnResult = { matchId: string; turn: number; result: 'P1'|'P2'|'DRAW'; ai?: boolean };
export type MatchResult = { matchId: string; winner: string };
export type ErrorMsg = { code: string; msg: string };

export type ServerToClient =
  | { type: 'ASSIGN'; data: Assign }
  | { type: 'TURN_START'; data: TurnStart }
  | { type: 'TURN_RESULT'; data: TurnResult }
  | { type: 'MATCH_RESULT'; data: MatchResult }
  | { type: 'ERROR'; data: ErrorMsg };
