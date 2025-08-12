'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BskyAgent } from '@atproto/api';

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
  const roundFromMid = useMemo(() => {
    if (!matchId) return null;
    const m = matchId.match(/-r(\d+)/);
    return m ? Number(m[1]) : null;
  }, [matchId]);

  const MoveChip = ({ move, align = 'left' as 'left'|'right' }: { move: 'R'|'P'|'S'|'-'; align?: 'left'|'right' }) => {
    const label = (move || '-') as 'R'|'P'|'S'|'-';
    const bg = label === 'R' ? '#2b1d1d' : label === 'P' ? '#1d2431' : label === 'S' ? '#2b2a1d' : '#1f1f1f';
    const fg = label === 'R' ? '#ff7878' : label === 'P' ? '#7fb2ff' : label === 'S' ? '#f6d06d' : '#aaa';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 28, padding: '2px 6px', borderRadius: 8,
        background: bg, color: fg, fontWeight: 700, fontFamily: 'monospace',
        marginLeft: align === 'right' ? 'auto' : 0
      }}>{label}</span>
    );
  };
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

  // Registration and auto-pairing
  const registerEntrant = async () => {
    if (!session) return;
    const res = await fetch(`${coordBase}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tid: 'demo', did: session.did, handle: session.handle }) });
    if (!res.ok) { setLog(prev => ["register failed", ...prev]); return; }
    setLog(prev => ["registered", ...prev]);
    pollAssignment();
  };

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

  const connectWithAssignment = async (assign: any) => {
    setMatchId(assign.match_id); setRole(assign.role); setPeerDid(assign?.peer?.did || null); setPeerHandle(assign?.peer?.handle || null);
    const myRole: 'P1'|'P2' = assign.role;
    const url = `${wsBase}?ticket=${encodeURIComponent(assign.ticket)}`;
    const socket = new WebSocket(url);
    socket.onopen = async () => {
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

  // 2P: Connect via coordinator queue and establish WebRTC DataChannel
  const connect2P = async () => {
    if (ws || !session || findingRef.current) return;
    findingRef.current = true;
    const coordBase = process.env.NEXT_PUBLIC_COORDINATOR_HTTP || 'http://localhost:8082';
    // poll queue until ASSIGN
    let assign: any = null;
    for (let i = 0; i < 20; i++) {
      // If we already connected while polling, stop
      if (ws) { findingRef.current = false; return; }
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
    await connectWithAssignment(assign);
    findingRef.current = false;
  };

  // Normal mode: auto-queue/connect upon sign-in
  useEffect(() => {
    if (MODE === 'normal' && session && !ws) {
      connect2P();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MODE, session, ws]);

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

  const playAgain = async () => { await leaveMatch(); await connect2P(); };

  const sendReveal = async (move: 'R' | 'P' | 'S') => {
    if (!ws || !matchId || !turn) return;
    const nonce = Math.random().toString(36).slice(2);
    const payload = { type: 'REVEAL', match_id: matchId, turn, move_: move, nonce };
    ws.send(JSON.stringify(payload));
    setLastMove(move);
    setSentByTurn((prev) => ({ ...prev, [turn]: { move, at: Date.now() } }));
  };

  return (
    <main className="pz-app">
      <h1>Peace.Zone RPS</h1>
      {!session ? (
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
          {authErr && <div style={{ color: 'tomato', width: '100%' }}>{authErr}</div>}
        </div>
      ) : (
        <div>
          <div>Signed in as: <strong>{session.handle}</strong> <span style={{ opacity: 0.7 }}>({shortDid(session.did)})</span></div>
          {role && (
            <>
              <div style={{ marginTop: 6, fontSize: 14, opacity: 0.85 }}>
                Role: <strong>{role}</strong> • Round: <strong>{roundFromMid ?? '-'}</strong> • Opponent: <strong>{peerHandle || shortDid(peerDid)}</strong>
              </div>
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
                  <div style={{ fontWeight: 700 }}>{session.handle}</div>
                </div>
                <div style={{ opacity: 0.7 }}>vs</div>
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Opponent</div>
                  <div style={{ fontWeight: 700 }}>{peerHandle || (peerDid || '-')}</div>
                </div>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {MODE === 'tournament' ? (
              <button className="btn" onClick={registerEntrant}>Register</button>
            ) : (
              <>
                <span style={{ opacity: 0.8 }}>Mode: Normal (auto-match)</span>
                {!ws && <button className="btn" onClick={connect2P}>Find opponent</button>}
                {!!ws && <button className="btn" onClick={leaveMatch}>Leave match</button>}
                <button className="btn" onClick={playAgain}>Play again</button>
              </>
            )}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Turn: <strong>{turn || '-'}</strong></span>
              <span style={{ fontSize: 22 }}>Time left: <strong>{secondsLeft}s</strong></span>
              <span>Score: <strong>You {p1Score} – {p2Score} {peerHandle || (peerDid || 'Opp')}</strong></span>
              <button className="move" disabled={!ws || !matchId || !turn} onClick={() => sendReveal('R')}>Rock</button>
              <button className="move" disabled={!ws || !matchId || !turn} onClick={() => sendReveal('P')}>Paper</button>
              <button className="move" disabled={!ws || !matchId || !turn} onClick={() => sendReveal('S')}>Scissors</button>
              {!!lastResult && (
                <span style={{ marginLeft: 8 }}>
                  {lastResult}{lastMove ? ` (you played ${lastMove})` : ''}
                </span>
              )}
            </div>
            {/* Turns table - NYT-inspired lightweight layout */}
            {!!turnsTable.length && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, opacity: 0.9 }}>YOU ({session.handle})</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, opacity: 0.9 }}>ROUND LOG</div>
                  <div style={{ textAlign: 'right', fontWeight: 700, opacity: 0.9 }}>OPP ({peerHandle || (peerDid || '-')})</div>
                </div>
                {turnsTable.map((row) => {
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
      <section>
        <h2>Audit</h2>
        <p>Round anchors and logs will be listed here for public verification.</p>
        {!!log.length && (
          <pre style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6 }}>
            {log.join('\n')}
          </pre>
        )}
      </section>
      <style jsx global>{`
        :root { --h1: 200; --h2: 330; --bg:#0b0f14; --glass:rgba(255,255,255,0.06); }
        body { background:
          radial-gradient(900px 500px at -10% -10%, hsl(var(--h1) 70% 20% / .5), transparent 60%),
          radial-gradient(900px 500px at 110% 10%, hsl(var(--h2) 70% 20% / .5), transparent 60%),
          linear-gradient(180deg,#0a0d12,#0e141e); color:#e6edf6; }
        .pz-app { max-width: 1100px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .btn { padding: 12px 14px !important; border-radius: 12px !important; border: 1px solid rgba(255,255,255,0.14) !important; 
          background: var(--glass) !important; backdrop-filter: blur(8px); color: #e6edf6 !important; }
        .move { padding: 14px 18px !important; border-radius: 999px !important; border: 0 !important; color: white !important;
          background: linear-gradient(180deg,hsl(var(--h1) 80% 52%), hsl(var(--h1) 80% 44%)) !important; box-shadow: 0 10px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2);
          transition: transform .06s ease, filter .2s ease; }
        .move:active { transform: translateY(1px); }
        .move:nth-of-type(2) { background: linear-gradient(180deg,hsl(50 90% 58%), hsl(43 90% 48%)) !important; }
        .move:nth-of-type(3) { background: linear-gradient(180deg,hsl(var(--h2) 80% 52%), hsl(var(--h2) 80% 44%)) !important; }
        pre { background: rgba(0,0,0,.55) !important; }
      `}</style>
    </main>
  );
}
