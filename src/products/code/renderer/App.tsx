import { useEffect, useState } from 'react';

import type { CodePlaceholderProjection } from '../api/projection';

import { fetchCodePlaceholder } from './api';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: CodePlaceholderProjection }
  | { status: 'error'; message: string };

function CodePlaceholderCard(
  { state }: { state: LoadState },
) {
  if (state.status === 'loading') {
    return <p style={{ margin: '16px 0 0', color: 'var(--text-muted, #94a3b8)' }}>Loading Cats Code placeholder...</p>;
  }

  if (state.status === 'error') {
    return <p style={{ margin: '16px 0 0', color: '#fca5a5' }}>{state.message}</p>;
  }

  const { payload } = state;

  return (
    <>
      <p style={{ margin: '16px 0 0', lineHeight: 1.6, color: 'var(--text-muted, #94a3b8)' }}>
        Dedicated product slice established. Future Code features should land under
        <code> src/products/code/*</code> instead of growing out of Chat.
      </p>
      <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
        <strong>Core-backed placeholder summary</strong>
        <div>Owner actor: <code>{payload.summary.ownerActorId}</code></div>
        <div>Actors: {payload.summary.actorCount}</div>
        <div>Conversations: {payload.summary.conversationCount}</div>
        <div>Tasks: {payload.summary.taskCount}</div>
      </div>
      <div style={{ marginTop: 24 }}>
        <strong>Reserved extension points</strong>
        <ul style={{ margin: '12px 0 0', paddingLeft: 20, color: 'var(--text-muted, #94a3b8)' }}>
          {payload.extensionPoints.futureRoutes.map((route) => (
            <li key={route}><code>{route}</code></li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default function CodeApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void fetchCodePlaceholder()
      .then((payload) => {
        if (!cancelled) {
          setState({ status: 'ready', payload });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load Cats Code placeholder.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
        background: 'var(--app-bg, #0f172a)',
      }}
    >
      <section
        style={{
          width: 'min(720px, 100%)',
          borderRadius: 24,
          padding: 32,
          background: 'var(--surface, rgba(15, 23, 42, 0.88))',
          color: 'var(--text-primary, #e2e8f0)',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.25)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--accent, #38bdf8)',
          }}
        >
          Cats Code
        </p>
        <h1 style={{ margin: '12px 0 0', fontSize: 32 }}>Code surface placeholder</h1>
        <CodePlaceholderCard state={state} />
      </section>
    </div>
  );
}
