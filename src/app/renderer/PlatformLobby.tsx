import { useNavigate } from 'react-router-dom';

import { platformSurfaceProductName, platformSurfaceRoutePrefix } from '../../core/platformSurface.js';
import { resolveRuntimeConnectionChip } from '../../design/components/runtimeChips.js';
import type { PlatformHostEnvelope } from '../../shared/platform-contract.js';
import { buildPlatformLobbySections } from './lobbyModel.js';

export function PlatformLobby({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const navigate = useNavigate();
  const sections = buildPlatformLobbySections({
    products: envelope.products,
    lastUsedSurface: envelope.lastProductSurface ?? null,
  });
  const runtimeChip = resolveRuntimeConnectionChip(envelope.runtime);
  const returnSurface = envelope.lastProductSurface ?? 'chat';

  return (
    <div className="screen screenCentered">
      <div className="platformLobby">
        <section className="contentCard setupCard platformLobbyHero">
          <div className="viewIntro">
            <p className="eyebrow">Cats</p>
            <h1>Lobby</h1>
            <p className="heroNote">
              Move between Home and Office without leaving the platform shell.
            </p>
          </div>

          <div className="platformLobbyMeta">
            <span className={runtimeChip.className}>{runtimeChip.label}</span>
            <span className="statusChip statusChipMuted">
              Owner: {envelope.ownerDisplayName}
            </span>
            <span className="statusChip statusChipAccent">
              Last used: {platformSurfaceProductName(returnSurface)}
            </span>
          </div>

          <div className="setupActionGroup">
            <button
              type="button"
              className="primaryButton"
              onClick={() => navigate(platformSurfaceRoutePrefix(returnSurface))}
            >
              Open {platformSurfaceProductName(returnSurface)}
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => navigate('/settings/general')}
            >
              Settings
            </button>
          </div>
        </section>

        <div className="platformLobbyGrid">
          {sections.map((section) => (
            <section key={section.id} className="contentCard platformLobbySection">
              <div className="contentCardHeader">
                <h2>{section.label}</h2>
              </div>
              <p className="heroNote platformLobbySectionNote">{section.description}</p>
              <div className="setupProductGrid">
                {section.entries.map((entry) => (
                  <button
                    key={entry.surface}
                    type="button"
                    className="setupProductCard platformLobbyProductCard"
                    onClick={() => navigate(entry.routePrefix)}
                  >
                    <div className="platformLobbyProductHeader">
                      <span className="setupProductLabel">{entry.productName}</span>
                    </div>
                    <div className="platformLobbyProductMeta">
                      <span className="statusChip statusChipReady">
                        {entry.installPolicy === 'required' ? 'Required' : 'Optional'}
                      </span>
                      {entry.installState !== 'installed' ? (
                        <span className="statusChip statusChipMuted">
                          {entry.installState === 'available'
                            ? 'Available'
                            : entry.installState === 'installing'
                              ? 'Installing'
                              : 'Needs attention'}
                        </span>
                      ) : null}
                      {entry.maturity === 'preview' ? (
                        <span className="statusChip statusChipMuted">Preview</span>
                      ) : null}
                      {entry.lastUsed ? (
                        <span className="statusChip statusChipAccent">Last used</span>
                      ) : null}
                    </div>
                    <span className="setupProductDescription">{entry.subtitle}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section className="contentCard platformLobbySection">
            <div className="contentCardHeader">
              <h2>Apps</h2>
            </div>
            <div className="emptyStateCard platformLobbyEmptyState">
              <strong>No extra apps installed yet</strong>
              <p>
                Shared and third-party apps will appear here once the host starts
                installing them.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
