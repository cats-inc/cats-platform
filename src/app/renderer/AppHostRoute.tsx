import { useLocation, useNavigate, useParams } from 'react-router-dom';

import type { PlatformHostEnvelope } from '../../shared/platform-contract.js';

function routeBelongsToEntry(pathname: string, routePath: string): boolean {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function AppHostRoute({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { appId = '' } = useParams();
  const app = envelope.installedApps.find((candidate) => candidate.id === appId);
  const activeEntry = app?.lobbyEntries.find((entry) =>
    routeBelongsToEntry(location.pathname, entry.routePath)) ?? app?.lobbyEntries[0] ?? null;

  if (!app) {
    return (
      <div className="screen screenCentered appHostScreen">
        <section className="appHostPanel">
          <p className="eyebrow">App</p>
          <h1>App not installed</h1>
          <button
            type="button"
            className="secondaryButton appHostBackButton"
            onClick={() => navigate('/lobby')}
          >
            Back to Lobby
          </button>
        </section>
      </div>
    );
  }

  const active = app.enabled && app.installState === 'enabled';
  const title = activeEntry?.title ?? app.displayName;
  const subtitle = activeEntry?.subtitle ?? (
    active ? 'App renderer pending' : 'App disabled'
  );

  return (
    <div className="screen screenCentered appHostScreen">
      <section className="appHostPanel">
        <div className="appHostHeader">
          <div>
            <p className="eyebrow">App</p>
            <h1>{title}</h1>
          </div>
          <button
            type="button"
            className="secondaryButton appHostBackButton"
            onClick={() => navigate('/lobby')}
          >
            Back to Lobby
          </button>
        </div>
        <p className="appHostSubtext">{subtitle}</p>
        <dl className="appHostMeta">
          <div>
            <dt>Package</dt>
            <dd>{app.id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{app.installState}</dd>
          </div>
          <div>
            <dt>Publisher</dt>
            <dd>{app.publisher}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
