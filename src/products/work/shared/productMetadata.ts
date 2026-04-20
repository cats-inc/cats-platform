import { resolvePlatformSurfaceRoutePrefix } from '../../../shared/platformProducts.js';
import { WORK_API_PREFIX } from './apiPaths.js';

export const WORK_PRODUCT_ID = 'work';
export const WORK_PRODUCT_NAME = 'Cats Work';
export const WORK_PRODUCT_ROUTE_BASE =
  resolvePlatformSurfaceRoutePrefix(WORK_PRODUCT_ID) as '/work';

const WORK_PRODUCT_REF = {
  id: WORK_PRODUCT_ID,
  name: WORK_PRODUCT_NAME,
} as const;

const WORK_ACTIVE_PRODUCT_REF = {
  ...WORK_PRODUCT_REF,
  status: 'active',
  routeBase: WORK_PRODUCT_ROUTE_BASE,
  apiBase: WORK_API_PREFIX,
} as const;

export function createWorkProductRef() {
  return { ...WORK_PRODUCT_REF };
}

export function createActiveWorkProductRef() {
  return { ...WORK_ACTIVE_PRODUCT_REF };
}
