import type { SuiteSurfaceId } from '../../shared/suite-contract.js';
import { suiteSurfaceProductName } from '../../core/suiteSurface.js';

interface SuiteProductBrandProps {
  surface: SuiteSurfaceId;
}

export function SuiteProductBrand({ surface }: SuiteProductBrandProps) {
  return <p className="brandLabel">{suiteSurfaceProductName(surface)}</p>;
}
