import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import { platformSurfaceProductName } from '../../core/platformSurface.js';

interface PlatformProductBrandProps {
  surface: PlatformSurfaceId;
}

export function PlatformProductBrand({ surface }: PlatformProductBrandProps) {
  return <p className="brandLabel">{platformSurfaceProductName(surface)}</p>;
}
