'use client';
import { useState } from 'react';

export default function HomePage() {
  const [session, setSession] = useState<{ did: string; handle: string } | null>(null);

  const signIn = async () => {
    // TODO: Implement OAuth/App-Password flows. Stub DID for now.
    setSession({ did: 'did:plc:example', handle: 'alice.bsky.social' });
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <h1>Peace.Zone RPS</h1>
      {!session ? (
        <button onClick={signIn} style={{ padding: 12 }}>Sign in with Bluesky</button>
      ) : (
        <div>
          <div>Signed in as: <strong>{session.handle}</strong> ({session.did})</div>
          <button style={{ marginTop: 12, padding: 12 }}>Register</button>
        </div>
      )}
      <section>
        <h2>Audit</h2>
        <p>Round anchors and logs will be listed here for public verification.</p>
      </section>
    </main>
  );
}
