import { messageKeys } from '../../../shared/i18n/index.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { useI18n } from '../i18n/index.js';
import { EntityIndexCards } from './EntityIndexCards.js';

export function EntitiesIndexPage({ envelope }: { envelope: PlatformHostEnvelope }) {
  const { t } = useI18n();

  return (
    <div
      className="entityCanvas entityCanvas--index"
      aria-label={t(messageKeys.entitiesShellAriaLabel)}
    >
      <header className="entityCanvasHeader">
        <div>
          <p className="eyebrow">{t(messageKeys.entityIndexEyebrow)}</p>
          <h1 className="entityCanvasTitle">{t(messageKeys.entitiesShellSurfaceLabel)}</h1>
        </div>
      </header>

      <EntityIndexCards envelope={envelope} />
    </div>
  );
}
