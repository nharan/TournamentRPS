'use client';
import { useMemo, useState } from 'react';
import { BskyAgent } from '@atproto/api';

export default function HomePage() {
  const [session, setSession] = useState<{ did: string; handle: string } | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const agent = useMemo(() => new BskyAgent({ service: `https://${process.env.NEXT_PUBLIC_ATPROTO_APPVIEW_HOST || 'api.bsky.app'}` }), []);

  const signIn = async () => {
    // MVP: App Password flow via prompt
    const identifier = prompt('Bluesky handle (e.g. alice.bsky.social)');
    const password = prompt('App Password (not your main password)');
    if (!identifier || !password) return;
    try {
      await agent.login({ identifier, password });
      const profile = await agent.getProfile({ actor: identifier });
      const did = agent.session?.did || profile.data.did;
      const handle = profile.data.handle;
      setSession({ did, handle });
    } catch (e) {
      alert('Login failed');
      console.error(e);
    }
  };

  const connectWs = async () => {
    if (ws || !session) return;
    // Ask coordinator to assign and mint a ticket
    const coordBase = process.env.NEXT_PUBLIC_COORDINATOR_HTTP || 'http://localhost:8080';
    const rr = await fetch(`${coordBase}/ready_for_round`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tid: 'demo', round: 1, did: session.did }) });
    const { match_id, ticket } = await rr.json();
    const wsBase = (process.env.NEXT_PUBLIC_SIGNALING_WS || 'ws://localhost:8080/ws');
    const url = `${wsBase}?ticket=${encodeURIComponent(ticket)}`;
    const socket = new WebSocket(url);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'READY_FOR_ROUND', data: { tid: 'demo', round: 1 } }));
    };
    socket.onmessage = (ev) => {
      console.log('WS message', ev.data);
    };
    socket.onclose = () => setWs(null);
    setWs(socket);
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h1>Peace.Zone RPS</h1>
      {!session ? (
        <button onClick={signIn} style={{ padding: 12 }}>Sign in with Bluesky</button>
      ) : (
        <div>
          <div>Signed in as: <strong>{session.handle}</strong> ({session.did})</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button style={{ padding: 12 }}>Register</button>
            <button onClick={connectWs} style={{ padding: 12 }}>Connect</button>
          </div>
        </div>
      )}
      <section>
        <h2>Audit</h2>
        <p>Round anchors and logs will be listed here for public verification.</p>
      </section>
    </main>
  );
}
