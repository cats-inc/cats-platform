import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import { platformSurfaceProductName } from '../../core/platformSurface.js';
import { resolvePlatformProductDisplayNameById } from '../../app/renderer/platformProductCopy.js';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';

interface PlatformProductBrandProps {
  surface: PlatformSurfaceId;
}

export function PlatformProductBrand({ surface }: PlatformProductBrandProps) {
  const { t } = useI18n();
  return (
    <p className="brandLabel">
      {resolvePlatformProductDisplayNameById(surface, platformSurfaceProductName(surface), t)}
    </p>
  );
}
