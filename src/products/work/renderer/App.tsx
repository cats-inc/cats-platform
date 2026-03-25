import { useEffect, useState } from 'react';

import type { WorkPlaceholderProjection } from '../api/projection';

import { fetchWorkPlaceholder } from './api';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: WorkPlaceholderProjection }
  | { status: 'error'; message: string };

function WorkPlaceholderCard(
  { state }: { state: LoadState },
) {
  if (state.status === 'loading') {
    return <p className="productPlaceholderCopy">Loading Cats Work placeholder...</p>;
  }

  if (state.status === 'error') {
    return <p className="productPlaceholderError">{state.message}</p>;
  }

  const { payload } = state;

  return (
    <>
      <p className="productPlaceholderCopy">
        Dedicated product slice established. Future Work features should land under
        <code> src/products/work/*</code> instead of growing out of Chat.
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

export default function WorkApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void fetchWorkPlaceholder()
      .then((payload) => {
        if (!cancelled) {
          setState({ status: 'ready', payload });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load Cats Work placeholder.',
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
        <p className="productPlaceholderEyebrow">Cats Work</p>
        <h1 className="productPlaceholderTitle">Work surface placeholder</h1>
        <WorkPlaceholderCard state={state} />
      </section>
    </div>
  );
}
