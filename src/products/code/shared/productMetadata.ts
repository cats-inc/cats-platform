import { resolvePlatformSurfaceRoutePrefix } from '../../../shared/platformProducts.js';
import { CODE_API_PREFIX } from './apiPaths.js';

export const CODE_PRODUCT_ID = 'code';
export const CODE_PRODUCT_NAME = 'Cats Code';
export const CODE_PRODUCT_ROUTE_BASE =
  resolvePlatformSurfaceRoutePrefix(CODE_PRODUCT_ID) as '/code';

const CODE_PRODUCT_REF = {
  id: CODE_PRODUCT_ID,
  name: CODE_PRODUCT_NAME,
} as const;

const CODE_ACTIVE_PRODUCT_REF = {
  ...CODE_PRODUCT_REF,
  status: 'active',
  routeBase: CODE_PRODUCT_ROUTE_BASE,
  apiBase: CODE_API_PREFIX,
} as const;

export function createCodeProductRef() {
  return { ...CODE_PRODUCT_REF };
}

export function createActiveCodeProductRef() {
  return { ...CODE_ACTIVE_PRODUCT_REF };
}
