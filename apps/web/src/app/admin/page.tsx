'use client';
import { useState } from 'react';

export default function AdminPage() {
  const coordBase = process.env.NEXT_PUBLIC_COORDINATOR_HTTP || 'http://localhost:8082';
  const sigWs = process.env.NEXT_PUBLIC_SIGNALING_WS || 'ws://localhost:8081/ws';
  const sigUrl = new URL(sigWs);
  const sigHttpBase = `${sigUrl.protocol.replace('ws', 'http')}//${sigUrl.host}`;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [tid, setTid] = useState('demo');
  const [round, setRound] = useState(1);

  const startRound = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${coordBase}/start_round`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tid, round: Number(round) }) });
      const j = await r.json().catch(() => ({}));
      setMsg(`start_round: ${r.status} ${JSON.stringify(j)}`);
    } catch (e: any) {
      setMsg(`start_round failed: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const resetTournament = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${coordBase}/admin/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tid }) });
      const j = await r.json().catch(() => ({}));
      setMsg(`coordinator reset: ${r.status} ${JSON.stringify(j)}`);
    } catch (e: any) {
      setMsg(`coordinator reset failed: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const resetSignaling = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${sigHttpBase}/admin/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const j = await r.json().catch(() => ({}));
      setMsg(`signaling reset: ${r.status} ${JSON.stringify(j)}`);
    } catch (e: any) {
      setMsg(`signaling reset failed: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const viewState = async () => {
    setBusy(true); setMsg('');
    try {
      const [c, s] = await Promise.all([
        fetch(`${coordBase}/admin/state`).then(r => r.json()).catch(() => ({})),
        fetch(`${sigHttpBase}/admin/state`).then(r => r.json()).catch(() => ({})),
      ]);
      setMsg(`state:\ncoordinator=${JSON.stringify(c)}\nsignaling=${JSON.stringify(s)}`);
    } catch (e: any) {
      setMsg(`state failed: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const resetEverything = async () => {
    setBusy(true); setMsg('');
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${coordBase}/admin/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(r => r.json()).catch(() => ({})),
        fetch(`${sigHttpBase}/admin/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(r => r.json()).catch(() => ({})),
      ]);
      setMsg(`reset all done\ncoordinator=${JSON.stringify(cr)}\nsignaling=${JSON.stringify(sr)}`);
    } catch (e: any) {
      setMsg(`reset all failed: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>Admin</h1>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>tid <input value={tid} onChange={e => setTid(e.target.value)} style={{ padding: 8 }} /></label>
        <label>round <input type="number" value={round} onChange={e => setRound(Number(e.target.value))} style={{ padding: 8, width: 80 }} /></label>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button disabled={busy} onClick={startRound}>Start round</button>
        <button disabled={busy} onClick={resetTournament}>Reset tournament (coordinator)</button>
        <button disabled={busy} onClick={resetSignaling}>Reset signaling (matches)</button>
        <button disabled={busy} onClick={resetEverything}>Reset everything</button>
        <button disabled={busy} onClick={viewState}>View state</button>
      </div>
      {!!msg && (
        <pre style={{ background: '#111', color: '#eee', padding: 12, borderRadius: 6 }}>{msg}</pre>
      )}
    </main>
  );
}


