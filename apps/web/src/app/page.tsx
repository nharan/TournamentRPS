'use client';
import { useMemo, useState } from 'react';
import { BskyAgent } from '@atproto/api';

export default function HomePage() {
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
  const agent = useMemo(() => new BskyAgent({ service: `${process.env.NEXT_PUBLIC_ATPROTO_PDS_URL || 'https://bsky.social'}` }), []);
  const apiBase = process.env.NEXT_PUBLIC_MATCH_ENGINE_HTTP || 'http://localhost:8083';

  // countdown ticker
  useMemo(() => {
    const t = setInterval(() => {
      if (!deadline) { setSecondsLeft(0); return; }
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(s);
    }, 300);
    return () => clearInterval(t);
  }, [deadline]);

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
      const coordBase = process.env.NEXT_PUBLIC_COORDINATOR_HTTP || 'http://localhost:8082';
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
      const wsBase = (process.env.NEXT_PUBLIC_SIGNALING_WS || 'ws://localhost:8081/ws');
      const url = `${wsBase}?ticket=${encodeURIComponent(ticket)}`;
      const socket = new WebSocket(url);
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'READY_FOR_ROUND', tid: 'demo', round: 1 }));
      };
      socket.onmessage = (ev) => {
        const msgText = String(ev.data);
        setLog((prev) => [msgText, ...prev].slice(0, 50));
        try {
          const msg = JSON.parse(msgText);
          if (msg.type === 'ASSIGN') {
            setMatchId(msg.match_id);
          } else if (msg.type === 'TURN_START') {
            setTurn(msg.turn ?? 0);
            if (msg.match_id) setMatchId(msg.match_id);
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
        } catch {}
      };
      socket.onclose = () => setWs(null);
      setWs(socket);
    } catch (e) {
      console.error(e);
      alert('Connect failed: browser could not reach coordinator (CORS or port)');
    }
  };

  const sendReveal = async (move: 'R' | 'P' | 'S') => {
    if (!ws || !matchId || !turn) return;
    const nonce = Math.random().toString(36).slice(2);
    const payload = { type: 'REVEAL', match_id: matchId, turn, move_: move, nonce };
    ws.send(JSON.stringify(payload));
    setLastMove(move);
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
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
          <div>Signed in as: <strong>{session.handle}</strong> ({session.did})</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={{ padding: 12 }}>Register</button>
            <button onClick={connectWs} style={{ padding: 12 }}>Connect</button>
            <button onClick={() => { setMatchId(null); setTurn(0); setP1Score(0); setP2Score(0); setDeadline(null); setSecondsLeft(0); setLastResult(''); setLastMove(null); ws?.close(); setWs(null); setTimeout(connectWs, 100); }} style={{ padding: 12 }}>New match</button>
            <button onClick={async () => {
              // Demo commit/reveal against match-engine
              const mid = 'demo-1'; const nonce = Math.random().toString(36).slice(2);
              const turn = 1; const move = 'R';
              const cRes = await fetch(`${apiBase}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: mid, did: session.did, turn, move_: move, nonce }) });
              const { commit } = await cRes.json();
              const rRes = await fetch(`${apiBase}/reveal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commit, match_id: mid, did: session.did, turn, move_: move, nonce }) });
              const rj = await rRes.json();
              alert(`Reveal valid=${rj.valid}`);
            }} style={{ padding: 12 }}>Commit/Reveal</button>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Turn: <strong>{turn || '-'}</strong></span>
              <span>Time left: <strong>{secondsLeft}s</strong></span>
              <span>Score: <strong>You {p1Score} – {p2Score} Opp</strong></span>
              <button disabled={!ws || !matchId || !turn} onClick={() => sendReveal('R')} style={{ padding: 16, fontSize: 16 }}>Rock</button>
              <button disabled={!ws || !matchId || !turn} onClick={() => sendReveal('P')} style={{ padding: 16, fontSize: 16 }}>Paper</button>
              <button disabled={!ws || !matchId || !turn} onClick={() => sendReveal('S')} style={{ padding: 16, fontSize: 16 }}>Scissors</button>
              {!!lastResult && (
                <span style={{ marginLeft: 8 }}>
                  {lastResult}{lastMove ? ` (you played ${lastMove})` : ''}
                </span>
              )}
            </div>
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
    </main>
  );
}
