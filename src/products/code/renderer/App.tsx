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
    return <p className="productPlaceholderCopy">Loading Cats Code placeholder...</p>;
  }

  if (state.status === 'error') {
    return <p className="productPlaceholderError">{state.message}</p>;
  }

  const { payload } = state;

  return (
    <>
      <p className="productPlaceholderCopy">
        Dedicated product slice established. Future Code features should land under
        <code> src/products/code/*</code> instead of growing out of Chat.
      </p>
      <div className="productPlaceholderSection">
        <strong>Core-backed placeholder summary</strong>
        <div>Owner actor: <code>{payload.summary.ownerActorId}</code></div>
        <div>Actors: {payload.summary.actorCount}</div>
        <div>Conversations: {payload.summary.conversationCount}</div>
        <div>Tasks: {payload.summary.taskCount}</div>
      </div>
      <div className="productPlaceholderSection">
        <strong>Reserved extension points</strong>
        <ul className="productPlaceholderRouteList">
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
    <div className="productPlaceholderSurface">
      <section className="productPlaceholderCard">
        <p className="productPlaceholderEyebrow">Cats Code</p>
        <h1 className="productPlaceholderTitle">Code surface placeholder</h1>
        <CodePlaceholderCard state={state} />
      </section>
    </div>
  );
}
