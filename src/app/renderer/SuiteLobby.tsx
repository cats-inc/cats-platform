import { useNavigate } from 'react-router-dom';

import { suiteSurfaceProductName, suiteSurfaceRoutePrefix } from '../../core/suiteSurface.js';
import { resolveRuntimeConnectionChip } from '../../design/components/runtimeChips.js';
import type { SuiteHostEnvelope } from '../../shared/suite-contract.js';
import { buildSuiteLobbySections } from './lobbyModel.js';

export function SuiteLobby({
  envelope,
}: {
  envelope: SuiteHostEnvelope;
}) {
  const navigate = useNavigate();
  const sections = buildSuiteLobbySections({
    products: envelope.products,
    lastUsedSurface: envelope.lastProductSurface ?? null,
  });
  const runtimeChip = resolveRuntimeConnectionChip(envelope.runtime);
  const returnSurface = envelope.lastProductSurface ?? 'chat';

  return (
    <div className="screen screenCentered">
      <div className="suiteLobby">
        <section className="contentCard setupCard suiteLobbyHero">
          <div className="viewIntro">
            <p className="eyebrow">Cats</p>
            <h1>Lobby</h1>
            <p className="heroNote">
              Move between Home and Office without leaving the suite shell.
            </p>
          </div>

          <div className="suiteLobbyMeta">
            <span className={runtimeChip.className}>{runtimeChip.label}</span>
            <span className="statusChip statusChipMuted">
              Owner: {envelope.ownerDisplayName}
            </span>
            <span className="statusChip statusChipAccent">
              Last used: {suiteSurfaceProductName(returnSurface)}
            </span>
          </div>

          <div className="setupActionGroup">
            <button
              type="button"
              className="primaryButton"
              onClick={() => navigate(suiteSurfaceRoutePrefix(returnSurface))}
            >
              Open {suiteSurfaceProductName(returnSurface)}
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

        <div className="suiteLobbyGrid">
          {sections.map((section) => (
            <section key={section.id} className="contentCard suiteLobbySection">
              <div className="contentCardHeader">
                <h2>{section.label}</h2>
              </div>
              <p className="heroNote suiteLobbySectionNote">{section.description}</p>
              <div className="setupProductGrid">
                {section.entries.map((entry) => (
                  <button
                    key={entry.surface}
                    type="button"
                    className="setupProductCard suiteLobbyProductCard"
                    onClick={() => navigate(entry.routePrefix)}
                  >
                    <div className="suiteLobbyProductHeader">
                      <span className="setupProductLabel">{entry.productName}</span>
                    </div>
                    <div className="suiteLobbyProductMeta">
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

          <section className="contentCard suiteLobbySection">
            <div className="contentCardHeader">
              <h2>Apps</h2>
            </div>
            <div className="emptyStateCard suiteLobbyEmptyState">
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
