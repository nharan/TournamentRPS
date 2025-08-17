/**
 * Main app page. Handles Bluesky auth, matchmaking, WS/WebRTC flows,
 * and a minimal UI. The Audit panel renders only when `debug` is true.
 */
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BskyAgent } from '@atproto/api';
import { IocainePowderAI, type RPS } from './ai/IocainePowderAI';

export default function HomePage() {
  const MODE: 'normal' | 'tournament' = (process.env.NEXT_PUBLIC_MODE === 'tournament') ? 'tournament' : 'normal';
  const [session, setSession] = useState<{ did: string; handle: string } | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [idInput, setIdInput] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [turn, setTurn] = useState<number>(0);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [lastResult, setLastResult] = useState<string>('');
  const [lastMove, setLastMove] = useState<'R'|'P'|'S'|null>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [dc, setDc] = useState<RTCDataChannel | null>(null);
  const [role, setRole] = useState<'P1'|'P2'|null>(null);
  const [peerDid, setPeerDid] = useState<string | null>(null);
  const [peerHandle, setPeerHandle] = useState<string | null>(null);
  const [debug, setDebug] = useState<boolean>(false);
  const [events, setEvents] = useState<any[]>([]);
  const [sentByTurn, setSentByTurn] = useState<Record<number, { move: 'R'|'P'|'S'; at: number }>>({});
  const [turnsTable, setTurnsTable] = useState<Array<{ turn: number; you: 'R'|'P'|'S'|'-'; opp: 'R'|'P'|'S'|'-'; result: 'WIN'|'LOSE'|'DRAW'; timeout: 'YOU'|'OPP'|'NONE' }>>([]);
  const [processed, setProcessed] = useState<Record<number, boolean>>({});
  const processedKeyedRef = useMemo(() => ({ set: new Set<string>() }), []);
  const [auditSeen, setAuditSeen] = useState<Record<string, boolean>>({});
  const [clockSkewMs, setClockSkewMs] = useState<number>(0); // serverNow - localNow
  const findingRef = useRef<boolean>(false);
  const shortDid = (d?: string | null) => d ? ((d.startsWith('did:plc:') ? d.slice(8, 14) : d.slice(0, 6)) + '…') : '-';
  /** Extract the numeric round from a match id like "...-r7-...". */
  const roundFromMid = useMemo(() => {
    if (!matchId) return null;
    const m = matchId.match(/-r(\d+)/);
    return m ? Number(m[1]) : null;
  }, [matchId]);

  const ICONS: Record<'R'|'P'|'S', string> = { R: '👊', P: '✋', S: '✌️' };
  const LABELS: Record<'R'|'P'|'S', string> = { R: 'Rock', P: 'Paper', S: 'Scissors' };
  const BEATS: Record<'R'|'P'|'S', 'R'|'P'|'S'> = { R: 'S', P: 'R', S: 'P' };
  type AiEngine = {
    getNextMove: (playerInput: RPS | null) => RPS;
    reset: () => void;
    simulateNext?: (playerInput: RPS | null) => { aiMove: RPS; predicts: RPS };
    getLastPrediction?: () => RPS | null;
  };
  type BotSpec = { id: string; name: string; avatar: string; make: () => AiEngine; blurb?: string; difficulty?: 'Beginner'|'Intermediate'|'Advanced'|'Adaptive' };
  const makeIocaine = (): AiEngine => new IocainePowderAI();
  const BOTS: BotSpec[] = [
    { id: 'wally', name: 'Wally', avatar: '/bots/wally.png', make: makeIocaine, blurb: 'Pattern‑matching trickster', difficulty: 'Intermediate' },
  ];
  const MoveChip = ({ move, align = 'left' as 'left'|'right' }: { move: 'R'|'P'|'S'|'-'; align?: 'left'|'right' }) => {
    const label = (move || '-') as 'R'|'P'|'S'|'-';
    const bg = label === 'R' ? '#2b1d1d' : label === 'P' ? '#1d2431' : label === 'S' ? '#2b2a1d' : '#1f1f1f';
    const fg = label === 'R' ? '#ff7878' : label === 'P' ? '#7fb2ff' : label === 'S' ? '#f6d06d' : '#aaa';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 44, height: 40, padding: '4px 8px', borderRadius: 10,
        background: bg, color: fg, fontWeight: 700, fontSize: 22,
        marginLeft: align === 'right' ? 'auto' : 0
      }} aria-label={label as string}>{label === '-' ? '-' : ICONS[label as 'R'|'P'|'S']}</span>
    );
  };
  const MoveButton = ({ m, onClick, disabled }: { m: 'R'|'P'|'S'; onClick: () => void; disabled: boolean }) => (
    <button
      className={`move card move-${m}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={LABELS[m]}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px' }}
    >
      <span style={{ fontSize: 26 }}>{ICONS[m]}</span>
      <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.3 }}>{LABELS[m]}</span>
    </button>
  );
  const agent = useMemo(() => new BskyAgent({ service: `${process.env.NEXT_PUBLIC_ATPROTO_PDS_URL || 'https://bsky.social'}` }), []);
  const apiBase = process.env.NEXT_PUBLIC_MATCH_ENGINE_HTTP || 'http://localhost:8083';
  const coordBase = process.env.NEXT_PUBLIC_COORDINATOR_HTTP || 'http://localhost:8082';
  const wsBase = (process.env.NEXT_PUBLIC_SIGNALING_WS || 'ws://localhost:8081/ws');
  const shouldAudit = (msg: any) => {
    const t = msg?.type;
    return t === 'TURN_START' || t === 'TURN_RESULT' || t === 'MATCH_RESULT' || t === 'ERROR';
  };

  // countdown ticker using server clock offset when available
  useEffect(() => {
    const t = setInterval(() => {
      if (!deadline) { setSecondsLeft(0); return; }
      const now = Date.now() + clockSkewMs;
      // Add 999ms before floor to reduce off-by-one jitters between clients
      const s = Math.max(0, Math.floor((deadline - now + 999) / 1000));
      setSecondsLeft(s);
    }, 300);
    return () => clearInterval(t);
  }, [deadline, clockSkewMs]);

  /** Sign in with a Bluesky App Password and cache DID/handle. */
  const signIn = async () => {
    setAuthErr(null);
    const identifier = idInput.trim();
    const password = pwInput;
    if (!identifier || !password) {
      setAuthErr('Please enter your handle and App Password');
      return;
    }
    try {
      await agent.login({ identifier, password });
      const profile = await agent.getProfile({ actor: identifier });
      const did = agent.session?.did || profile.data.did;
      const handle = profile.data.handle;
      setSession({ did, handle });
      setPwInput('');
    } catch (e) {
      console.error(e);
      setAuthErr('Login failed. Ensure you use a Bluesky App Password (Settings → App passwords).');
    }
  };

  /** Single-player demo path: request a ticket then connect to signaling WS. */
  const connectWs = async () => {
    if (ws || !session) return;
    try {
      const rr = await fetch(`${coordBase}/ready_for_round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tid: 'demo', round: 1, did: session.did }),
      });
      if (!rr.ok) {
        const txt = await rr.text().catch(() => '');
        setLog((prev) => [`connect error: ${rr.status} ${txt}`, ...prev]);
        alert('Connect failed: coordinator not reachable (check port 8082)');
        return;
      }
      const { ticket } = await rr.json();
      const url = `${wsBase}?ticket=${encodeURIComponent(ticket)}`;
      const socket = new WebSocket(url);
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'READY_FOR_ROUND', tid: 'demo', round: 1 }));
      };
      socket.onmessage = (ev) => {
        const msgText = String(ev.data);
        try {
          const msg = JSON.parse(msgText);
          if (shouldAudit(msg)) {
            const key = msg.type === 'MATCH_RESULT'
              ? `${msg.type}#${msg.match_id}`
              : `${msg.type}#${msg.match_id || ''}#${msg.turn || ''}`;
            setAuditSeen((seen) => {
              if (seen[key]) return seen;
              setLog((prev) => [msgText, ...prev].slice(0, 50));
              return { ...seen, [key]: true };
            });
          }
          if (msg.type === 'SDP_OFFER' || msg.type === 'SDP_ANSWER' || msg.type === 'ICE') {
            // handled in 2P flow only
            return;
          }
          if (msg.type === 'ASSIGN') {
            setMatchId(msg.match_id);
            if (msg.role) setRole(msg.role);
            if (msg.peer && typeof msg.peer === 'object') {
              if (msg.peer.did) setPeerDid(msg.peer.did);
              if (msg.peer.handle) setPeerHandle(msg.peer.handle);
            }
          } else if (msg.type === 'TURN_START') {
            setTurn(msg.turn ?? 0);
            if (msg.match_id) setMatchId(msg.match_id);
            if (typeof msg.now_ms_epoch === 'number') {
              const localNow = Date.now();
              setClockSkewMs(Number(msg.now_ms_epoch) - localNow);
            }
            if (msg.deadline_ms_epoch) setDeadline(Number(msg.deadline_ms_epoch));
          } else if (msg.type === 'MATCH_RESULT') {
            setTurn(0);
            setDeadline(null);
          } else if (msg.type === 'TURN_RESULT') {
            // winner: 'P1' | 'P2' | 'DRAW'
            if (msg.result === 'P1') setP1Score((s) => s + 1);
            else if (msg.result === 'P2') setP2Score((s) => s + 1);
            setDeadline(null);
            if (msg.result === 'DRAW') setLastResult('Draw');
            else if (msg.result === 'P1') setLastResult('You won this turn');
            else setLastResult('Opponent won this turn');
          }
        } catch {
          // non-JSON: ignore
        }
      };
      socket.onclose = () => setWs(null);
      setWs(socket);
    } catch (e) {
      console.error(e);
      alert('Connect failed: browser could not reach coordinator (CORS or port)');
    }
  };

  /** Tournament mode: register this user and then poll for assignment. */
  const registerEntrant = async () => {
    if (!session) return;
    const res = await fetch(`${coordBase}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tid: 'demo', did: session.did, handle: session.handle }) });
    if (!res.ok) { setLog(prev => ["register failed", ...prev]); return; }
    setLog(prev => ["registered", ...prev]);
    pollAssignment();
  };

  /** Poll the coordinator for an ASSIGN entry, then connect via ticket. */
  const pollAssignment = async () => {
    if (!session) return;
    for (let i = 0; i < 120; i++) {
      const r = await fetch(`${coordBase}/assignment?tid=demo&did=${encodeURIComponent(session.did)}`);
      const j = await r.json();
      if (j.status === 'ASSIGN') {
        await connectWithAssignment(j);
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    setLog((prev) => ['assignment timeout', ...prev]);
  };

  /** Establish WS and WebRTC DataChannel using an ASSIGN payload. */
  const connectWithAssignment = async (assign: any) => {
    // If AI mode became active, ignore stale PvP assignment
    if (aiModeRef.current) {
      try { await cancelQueue(); } catch {}
      return;
    }
    setMatchId(assign.match_id); setRole(assign.role); setPeerDid(assign?.peer?.did || null); setPeerHandle(assign?.peer?.handle || null);
    const myRole: 'P1'|'P2' = assign.role;
    const url = `${wsBase}?ticket=${encodeURIComponent(assign.ticket)}`;
    const socket = new WebSocket(url);
    socket.onopen = async () => {
      if (aiModeRef.current) { try { socket.close(1000, 'ai_mode'); } catch {} return; }
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peer.onicecandidate = (e) => { if (e.candidate) socket.send(JSON.stringify({ type: 'ICE', match_id: assign.match_id, candidate: JSON.stringify(e.candidate) })); };
      peer.ondatachannel = (e) => setDc(e.channel);
      setPc(peer);
      if (assign.role === 'P1') {
        const channel = peer.createDataChannel('rps'); setDc(channel);
        const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: 'SDP_OFFER', match_id: assign.match_id, sdp: JSON.stringify(offer) }));
      }
    };
    socket.onmessage = async (ev) => {
      if (aiModeRef.current) { try { socket.close(1000, 'ai_mode'); } catch {} return; }
      const txt = String(ev.data);
      try {
        const msg = JSON.parse(txt);
        setEvents((prev) => [{ t: Date.now(), msg }, ...prev].slice(0, 100));
        if (shouldAudit(msg)) {
          const key = msg.type === 'MATCH_RESULT'
            ? `${msg.type}#${msg.match_id}`
            : `${msg.type}#${msg.match_id || ''}#${msg.turn || ''}`;
          setAuditSeen((seen) => {
            if (seen[key]) return seen;
            setLog((prev) => [txt, ...prev].slice(0, 50));
            return { ...seen, [key]: true };
          });
        }
        // P2P signaling
        if (pc) {
          if (msg.type === 'SDP_OFFER' && msg.match_id === assign.match_id && myRole === 'P2') {
            const desc = new RTCSessionDescription(JSON.parse(msg.sdp));
            await pc.setRemoteDescription(desc);
            const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
            socket.send(JSON.stringify({ type: 'SDP_ANSWER', match_id: assign.match_id, sdp: JSON.stringify(ans) }));
            return;
          }
          if (msg.type === 'SDP_ANSWER' && msg.match_id === assign.match_id && myRole === 'P1') {
            const desc = new RTCSessionDescription(JSON.parse(msg.sdp));
            await pc.setRemoteDescription(desc);
            return;
          }
          if (msg.type === 'ICE' && msg.match_id === assign.match_id) {
            const cand = new RTCIceCandidate(JSON.parse(msg.candidate));
            await pc.addIceCandidate(cand);
            return;
          }
        }
        // Game messages
        if (msg.type === 'ASSIGN') {
          setMatchId(msg.match_id);
        } else if (msg.type === 'TURN_START') {
          setTurn(msg.turn ?? 0);
          if (msg.match_id) setMatchId(msg.match_id);
          if (typeof msg.now_ms_epoch === 'number') {
            const localNow = Date.now();
            setClockSkewMs(Number(msg.now_ms_epoch) - localNow);
          }
          if (msg.deadline_ms_epoch) setDeadline(Number(msg.deadline_ms_epoch));
        } else if (msg.type === 'MATCH_RESULT') {
          setTurn(0);
          setDeadline(null);
        } else if (msg.type === 'OPPONENT_LEFT') {
          // Opponent left: exit match and requeue in normal mode
          await leaveMatch();
          if (MODE === 'normal') { await connect2P(); }
          return;
        } else if (msg.type === 'TURN_RESULT') {
          const whoWon = msg.result as 'P1'|'P2'|'DRAW';
          const key = `${msg.match_id || assign.match_id}#${msg.turn}`;
          if (processedKeyedRef.set.has(key)) return;
          processedKeyedRef.set.add(key);
          if (whoWon !== 'DRAW') {
            const youWon = whoWon === myRole;
            if (youWon) setP1Score((s) => s + 1); else setP2Score((s) => s + 1);
          }
          setDeadline(null);
          if (whoWon === 'DRAW') setLastResult('Draw');
          else if ((myRole === 'P1' && whoWon === 'P1') || (myRole === 'P2' && whoWon === 'P2')) setLastResult('You won this turn');
          else setLastResult('Opponent won this turn');

          // Build a human log row
          const p1m = (msg.p1_move as string | undefined)?.toUpperCase?.() as 'R'|'P'|'S'|undefined;
          const p2m = (msg.p2_move as string | undefined)?.toUpperCase?.() as 'R'|'P'|'S'|undefined;
          const youMove = myRole === 'P1' ? (p1m || (sentByTurn[msg.turn]?.move ?? '-')) : (p2m || (sentByTurn[msg.turn]?.move ?? '-'));
          const oppMove = myRole === 'P1' ? (p2m ?? '-') : (p1m ?? '-');
          let result: 'WIN'|'LOSE'|'DRAW' = 'DRAW';
          if (whoWon !== 'DRAW') {
            const youWon = (myRole === 'P1' && whoWon === 'P1') || (myRole === 'P2' && whoWon === 'P2');
            result = youWon ? 'WIN' : 'LOSE';
          }
          const aiFor: string[] = Array.isArray(msg.ai_for_dids) ? msg.ai_for_dids as string[] : [];
          let timeout: 'YOU'|'OPP'|'NONE' = 'NONE';
          if (session) {
            if (aiFor.includes(session.did)) timeout = 'YOU';
            else if (peerDid && aiFor.includes(peerDid)) timeout = 'OPP';
          }
          setTurnsTable((prev) => {
            const withoutDup = prev.filter((r) => r.turn !== (msg.turn ?? 0));
            const safeOpp: 'R'|'P'|'S'|'-' = (['R','P','S'] as const).includes(oppMove as any) ? (oppMove as 'R'|'P'|'S') : '-';
            const safeYou: 'R'|'P'|'S'|'-' = (['R','P','S'] as const).includes(youMove as any) ? (youMove as 'R'|'P'|'S') : '-';
            return [...withoutDup, { turn: msg.turn ?? 0, you: safeYou, opp: safeOpp, result, timeout }].sort((a,b)=>a.turn-b.turn);
          });
        }
      } catch {
        // ignore non-JSON
      }
    };
    socket.onclose = () => setWs(null);
    setWs(socket);
  };

  /** Normal mode: queue for an opponent until assigned, then connect. */
  const connect2P = async () => {
    if (ws || !session || findingRef.current) return;
    findingRef.current = true;
    const coordBase = process.env.NEXT_PUBLIC_COORDINATOR_HTTP || 'http://localhost:8082';
    // poll queue until ASSIGN
    let assign: any = null;
    for (let i = 0; i < 20; i++) {
      // If we already connected while polling, stop
      if (ws) { findingRef.current = false; return; }
      if (aiModeRef.current) { try { await cancelQueue(); } catch {}; findingRef.current = false; return; }
      const res = await fetch(`${coordBase}/queue_ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tid: 'demo', did: session.did, handle: session.handle })
      });
      const j = await res.json();
      if (j.status === 'ASSIGN') { assign = j; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!assign) {
      // No alert; just log and allow user to retry
      setLog(prev => ['queue: no opponent found (timeout)', ...prev]);
      findingRef.current = false;
      return;
    }
    if (aiModeRef.current) { try { await cancelQueue(); } catch {}; findingRef.current = false; return; }
    await connectWithAssignment(assign);
    findingRef.current = false;
  };

  // Normal mode: auto-queue/connect upon sign-in (skip when in AI mode)
  useEffect(() => {
    // defer read of aiMode until after its declaration via a microtask
    Promise.resolve().then(() => {
      if (MODE === 'normal' && session && !ws && !aiMode) {
        connect2P();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MODE, session, ws]);

  /** Clear all ephemeral client state for a fresh match. */
  const resetLocalState = () => {
    setMatchId(null);
    setRole(null);
    setPeerDid(null);
    setPeerHandle(null);
    setTurn(0);
    setDeadline(null);
    setSecondsLeft(0);
    setLastResult('');
    setLastMove(null);
    setP1Score(0);
    setP2Score(0);
    setSentByTurn({});
    setTurnsTable([]);
    processedKeyedRef.set.clear?.();
  };

  // --- AI mode (single-player) ---
  const [aiMode, setAiMode] = useState<boolean>(false);
  const aiModeRef = useRef<boolean>(false);
  useEffect(() => { aiModeRef.current = aiMode; }, [aiMode]);
  const aiRef = useRef<AiEngine | null>(null);
  const [aiPlan, setAiPlan] = useState<{ aiMove: RPS; predicts: RPS } | null>(null);
  const [peekText, setPeekText] = useState<string>('');
  const [aiBot, setAiBot] = useState<BotSpec | null>(null);
  const [showBotPicker, setShowBotPicker] = useState<boolean>(false);

  const startAiMatch = async (bot?: BotSpec) => {
    // Switch to AI mode and cleanly exit any ongoing PvP match so the opponent is notified
    setAiMode(true);
    await cancelQueue();
    await leaveMatch();
    const chosen = bot || BOTS[0];
    setAiBot(chosen);
    setPeerHandle(chosen?.name || 'AI');
    setRole('P1');
    setMatchId('local-ai');
    setTurn(1);
    const engine = (chosen?.make || makeIocaine)();
    aiRef.current = engine;
    const first = engine.getNextMove(null);
    const predicts = (engine.getLastPrediction?.() || 'R') as RPS;
    setAiPlan({ aiMove: first, predicts });
    setPeekText('');
    setShowBotPicker(false);
  };

  const stopAiMatch = async () => {
    setAiMode(false);
    aiRef.current = null;
    setAiPlan(null);
    setPeekText('');
    setAiBot(null);
    await leaveMatch();
  };

  /** Leave current match and reset local state and transports. */
  const leaveMatch = async () => {
    try {
      if (ws) { try { ws.close(); } catch {} }
      if (pc) { try { pc.close(); } catch {} }
      if (dc) { try { dc.close(); } catch {} }
    } finally {
      setWs(null); setPc(null); setDc(null);
      resetLocalState();
    }
  };

  // Explicitly cancel any queue wait when switching to AI mode or leaving PvP intents
  const cancelQueue = async () => {
    if (!session) return;
    try {
      await fetch(`${coordBase}/queue_cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ did: session.did }) });
    } catch {}
  };

  /** Leave and immediately requeue for a new opponent. */
  const playAgain = async () => { await leaveMatch(); await connect2P(); };

  /** Send this turn's reveal to the signaling server. */
  const sendReveal = async (move: 'R' | 'P' | 'S') => {
    if (aiMode) {
      if (!turn || !aiPlan || !aiRef.current) return;
      const yourMove = move as RPS;
      const oppMove = aiPlan.aiMove as RPS;
      const beats = (a: RPS, b: RPS) => (a === 'R' && b === 'S') || (a === 'S' && b === 'P') || (a === 'P' && b === 'R');
      let who: 'WIN'|'LOSE'|'DRAW' = 'DRAW';
      if (yourMove === oppMove) who = 'DRAW'; else if (beats(yourMove, oppMove)) who = 'WIN'; else who = 'LOSE';
      if (who === 'WIN') setP1Score((s) => s + 1); else if (who === 'LOSE') setP2Score((s) => s + 1);
      setTurnsTable((prev) => [...prev, { turn, you: yourMove, opp: oppMove, result: who, timeout: 'NONE' }]);
      setLastResult(who === 'DRAW' ? 'Draw' : who === 'WIN' ? 'You won this turn' : 'Opponent won this turn');
      setLastMove(yourMove);
      setSentByTurn((prev) => ({ ...prev, [turn]: { move: yourMove, at: Date.now() } }));
      // prepare next
      const nextMove = aiRef.current.getNextMove(yourMove);
      const predicts = (aiRef.current.getLastPrediction?.() || 'R') as RPS;
      setAiPlan({ aiMove: nextMove, predicts });
      setTurn((t) => t + 1);
      setPeekText('');
      return;
    }
    if (!ws || !matchId || !turn) return;
    const nonce = Math.random().toString(36).slice(2);
    const payload = { type: 'REVEAL', match_id: matchId, turn, move_: move, nonce };
    ws.send(JSON.stringify(payload));
    setLastMove(move);
    setSentByTurn((prev) => ({ ...prev, [turn]: { move, at: Date.now() } }));
  };

  const showPeek = () => {
    if (!aiPlan) return;
    const botName = aiBot?.name || 'AI';
    const ai = aiPlan.aiMove as 'R'|'P'|'S';
    const pred = aiPlan.predicts as 'R'|'P'|'S';
    const other = BEATS[ai];
    const validPreds = new Set<'R'|'P'|'S'>([ai, other]);
    if (ai === pred) {
      setPeekText(`🤖 ${botName} wants to play ${ICONS[ai]} because it predicts you will either play ${ICONS[ai]} or ${ICONS[other]}`);
      return;
    }
    if (validPreds.has(pred)) {
      setPeekText(`🤖 ${botName} wants to play ${ICONS[ai]} because it predicts you will play ${ICONS[pred]}`);
      return;
    }
    // Fallback if predictor and move appear inconsistent: explain not-lose intent set
    setPeekText(`🤖 ${botName} wants to play ${ICONS[ai]} because it predicts you will either play ${ICONS[ai]} or ${ICONS[other]}`);
  };

  return (
    <main className="pz-app">
      <h1>Rock Paper Scissors</h1>
      {!session && !aiMode ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="handle">Bluesky handle</label>
            <input id="handle" placeholder="alice.bsky.social" value={idInput} onChange={e => setIdInput(e.target.value)} style={{ padding: 10, minWidth: 240 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="apppw">App Password (not your main password)</label>
            <input id="apppw" type="password" placeholder="xxxx-xxxx-xxxx-xxxx" value={pwInput} onChange={e => setPwInput(e.target.value)} style={{ padding: 10, minWidth: 240 }} />
          </div>
          <button onClick={signIn} style={{ padding: 12 }}>Sign in with Bluesky</button>
          <button className="btn" onClick={() => setShowBotPicker((s)=>!s)} style={{ marginLeft: 8 }}>Play Bots</button>
          {showBotPicker && (
            <div style={{ width: '100%', marginTop: 12 }}>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {BOTS.map(b => (
                  <button key={b.id} className="btn card" onClick={() => startAiMatch(b)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img src={b.avatar} alt={b.name} width={36} height={36} style={{ borderRadius: 999, background: '#233' }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 800 }}>{b.name}</div>
                        <div style={{ opacity: .8, fontSize: 12 }}>{b.blurb || 'Bot'}</div>
                      </div>
                    </div>
                    <div style={{ opacity: .8, fontSize: 12 }}>{b.difficulty || 'Custom'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {authErr && <div style={{ color: 'tomato', width: '100%' }}>{authErr}</div>}
        </div>
      ) : (
        <div>
          <div style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#151922',
            border: '1px solid #243049',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>You</div>
              <div style={{ fontWeight: 700 }}>{session?.handle || 'Guest'}</div>
            </div>
            <div style={{ opacity: 0.7 }}>vs</div>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Opponent</div>
              <div style={{ fontWeight: 700 }}>{aiMode ? (aiBot?.name || 'AI') : (peerHandle || (peerDid || '-'))}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {MODE === 'tournament' ? (
              <button className="btn" onClick={registerEntrant}>Register</button>
            ) : (
              <>
                <span style={{ opacity: 0.8 }}>Mode: {aiMode ? 'Single-player (AI)' : 'Normal (auto-match)'}</span>
                {!aiMode && !ws && session && <button className="btn" onClick={async () => { await cancelQueue(); connect2P(); }}>Find opponent</button>}
                {!aiMode && !!ws && <button className="btn" onClick={leaveMatch}>Leave match</button>}
                {!aiMode && <button className="btn" onClick={playAgain}>Play again</button>}
                {!aiMode && <button className="btn" onClick={() => setShowBotPicker((s)=>!s)}>Play Bots</button>}
                {aiMode && (
                  <>
                    <button className="btn" onClick={() => { setShowBotPicker(true); setAiMode(false); setAiBot(null); resetLocalState(); }}>Change Bot</button>
                    <button className="btn" onClick={() => { stopAiMatch(); }}>Back to Login</button>
                  </>
                )}
                {showBotPicker && (
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 10 }}>
                      {BOTS.map(b => (
                        <button key={b.id} className="btn card" onClick={() => { startAiMatch(b); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <img src={b.avatar} alt={b.name} width={36} height={36} style={{ borderRadius: 999, background: '#233' }} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800 }}>{b.name}</div>
                              <div style={{ opacity: .8, fontSize: 12 }}>{b.blurb || 'Bot'}</div>
                            </div>
                          </div>
                          <div style={{ opacity: .8, fontSize: 12 }}>{b.difficulty || 'Custom'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {aiMode && session && <button className="btn" onClick={stopAiMatch}>Back to PvP</button>}
              </>
            )}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Turn: <strong>{turn || '-'}</strong></span>
              {!aiMode && <span style={{ fontSize: 22 }}>Time left: <strong>{secondsLeft}s</strong></span>}
              {aiMode && (
                <button className="btn card" onClick={() => startAiMatch()} aria-label="Start a new AI game">↻ New Game</button>
              )}
            </div>
            {/* HUD / Scorecards */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
              {(() => {
                const ties = turnsTable.filter(r => r.result === 'DRAW').length;
                const oppLabel = aiMode ? (aiBot?.name || 'AI') : 'OPP';
                return (
                  <>
                    <div className="stat card"><div className="stat-num">{p1Score}</div><div className="stat-label">YOU</div></div>
                    <div className="stat card"><div className="stat-num">{ties}</div><div className="stat-label">TIES</div></div>
                    <div className="stat card"><div className="stat-num">{p2Score}</div><div className="stat-label">{oppLabel}</div></div>
                  </>
                );
              })()}
            </div>
            <div className="moves-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
              <MoveButton m="R" disabled={(!aiMode && (!ws || !matchId || !turn)) || (aiMode && !turn)} onClick={() => sendReveal('R')} />
              <MoveButton m="P" disabled={(!aiMode && (!ws || !matchId || !turn)) || (aiMode && !turn)} onClick={() => sendReveal('P')} />
              <MoveButton m="S" disabled={(!aiMode && (!ws || !matchId || !turn)) || (aiMode && !turn)} onClick={() => sendReveal('S')} />
              {aiMode && !!aiPlan && (
                <button className="btn" onClick={showPeek} style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>Peek</button>
              )}
            </div>
            {aiMode && !!peekText && (
              <div style={{ marginTop: 4, opacity: 0.9 }}>{peekText}</div>
            )}
            {!!lastResult && (
              <div style={{ marginTop: 8 }}>
                <span>
                  {lastResult}{lastMove ? ` (you played ${ICONS[lastMove]})` : ''}
                </span>
              </div>
            )}
            {/* Turns table - NYT-inspired lightweight layout */}
            {!!turnsTable.length && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, opacity: 0.9 }}>YOU ({session?.handle || 'Guest'})</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, opacity: 0.9 }}>ROUND LOG</div>
                  <div style={{ textAlign: 'right', fontWeight: 700, opacity: 0.9 }}>{aiMode ? `OPP (${aiBot?.name || 'AI'})` : `OPP (${peerHandle || (peerDid || '-')})`}</div>
                </div>
                {[...turnsTable].sort((a,b)=>b.turn-a.turn).map((row) => {
                  const icon = row.result === 'WIN' ? '✓' : row.result === 'LOSE' ? '✕' : '≡';
                  const color = row.result === 'WIN' ? '#66d17a' : row.result === 'LOSE' ? '#e57373' : '#f6c453';
                  const timeoutText = row.timeout === 'NONE' ? '' : row.timeout === 'YOU' ? 'timeout: you' : 'timeout: opponent';
                  return (
                    <div key={`row-${row.turn}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <MoveChip move={row.you} />
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'monospace' }}>Round {row.turn}</div>
                        <div style={{ fontSize: 20, color }}>{icon}</div>
                        {!!timeoutText && <div style={{ fontSize: 12, opacity: 0.75 }}>{timeoutText}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                        <MoveChip move={row.opp} align="right" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {debug && (
              <div style={{ marginTop: 10, padding: 10, background: '#1b1b1b', color: '#ddd', borderRadius: 6 }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>Sent this turn: {sentByTurn[turn]?.move || '-'}</span>
                  <span>Deadline: {deadline ? new Date(deadline).toLocaleTimeString() : '-'}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  Last 10 messages:
                  <ul style={{ margin: '6px 0 0 16px' }}>
                    {events.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        <code>{new Date(e.t).toLocaleTimeString()} {e.msg.type} {e.msg.turn ?? ''} {e.msg.result ?? ''} {Array.isArray(e.msg.ai_for_dids) ? `ai_for_dids=${e.msg.ai_for_dids.join(',')}` : ''}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {debug && (
        <section>
          <h2>Audit</h2>
          <p>Round anchors and logs will be listed here for public verification.</p>
          {!!log.length && (
            <pre style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6 }}>
              {log.join('\n')}
            </pre>
          )}
        </section>
      )}
      <style jsx global>{`
        :root { --h1: 200; --h2: 330; --bg:#0b0f14; --glass:rgba(255,255,255,0.06); }
        body { background:
          radial-gradient(900px 500px at -10% -10%, hsl(var(--h1) 70% 20% / .5), transparent 60%),
          radial-gradient(900px 500px at 110% 10%, hsl(var(--h2) 70% 20% / .5), transparent 60%),
          linear-gradient(180deg,#0a0d12,#0e141e); color:#e6edf6; }
        .pz-app { max-width: 1100px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .btn { padding: 12px 14px !important; border-radius: 12px !important; border: 1px solid rgba(255,255,255,0.14) !important; 
          background: var(--glass) !important; backdrop-filter: blur(8px); color: #e6edf6 !important; }
        .card { background: var(--glass); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; box-shadow: 0 10px 28px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.08); }
        .move { border: 0 !important; color: white !important; transition: transform .06s ease, filter .2s ease; }
        .move:active { transform: translateY(1px); }
        .move-R { background: linear-gradient(180deg,hsl(var(--h1) 80% 52%), hsl(var(--h1) 80% 44%)) !important; }
        .move-P { background: linear-gradient(180deg,hsl(50 90% 58%), hsl(43 90% 48%)) !important; }
        .move-S { background: linear-gradient(180deg,hsl(var(--h2) 80% 52%), hsl(var(--h2) 80% 44%)) !important; }
        .stat { min-width: 120px; padding: 12px 16px; text-align: center; }
        .stat-num { font-size: 28px; font-weight: 900; line-height: 1; }
        .stat-label { opacity: .85; margin-top: 6px; letter-spacing: .8px; font-size: 12px; }
        pre { background: rgba(0,0,0,.55) !important; }
      `}</style>
    </main>
  );
}
