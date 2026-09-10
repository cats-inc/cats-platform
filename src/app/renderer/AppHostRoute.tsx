import { useLocation, useNavigate, useParams } from 'react-router-dom';

import type { PlatformHostEnvelope } from '../../shared/platform-contract.js';
import { useI18n } from './i18n/index.js';
import { AppRendererSurface } from './AppRendererSurface.js';

function routeBelongsToEntry(pathname: string, routePath: string): boolean {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function AppHostRoute({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const { t, locale } = useI18n();
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
          <p className="eyebrow">{t('appHostLabel')}</p>
          <h1>{t('appHostNotInstalledTitle')}</h1>
          <button
            type="button"
            className="secondaryButton appHostBackButton"
            onClick={() => navigate('/lobby')}
          >
            {t('appHostBackToLobby')}
          </button>
        </section>
      </div>
    );
  }

  const active = app.enabled && app.installState === 'enabled';
  const title = activeEntry?.title ?? app.displayName;
  const subtitle = activeEntry?.subtitle ?? (
    active ? t('appHostSubtitleRendererPending') : t('appHostSubtitleDisabled')
  );

  return (
    <div className="screen screenCentered appHostScreen">
      <section className="appHostPanel" style={active ? { width: '100%', maxWidth: 1440 } : undefined}>
        <div className="appHostHeader">
          <div>
            <p className="eyebrow">{t('appHostLabel')}</p>
            <h1>{title}</h1>
          </div>
          <button
            type="button"
            className="secondaryButton appHostBackButton"
            onClick={() => navigate('/lobby')}
          >
            {t('appHostBackToLobby')}
          </button>
        </div>
        {active ? <AppRendererSurface appId={app.id} version={app.version} title={title}
          locale={locale} onLobby={() => navigate('/lobby')} /> : <p className="appHostSubtext">{subtitle}</p>}
        <dl className="appHostMeta">
          <div>
            <dt>{t('appHostSectionPackage')}</dt>
            <dd>{app.id}</dd>
          </div>
          <div>
            <dt>{t('appHostSectionStatus')}</dt>
            <dd>{app.installState}</dd>
          </div>
          <div>
            <dt>{t('appHostSectionPublisher')}</dt>
            <dd>{app.publisher}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
