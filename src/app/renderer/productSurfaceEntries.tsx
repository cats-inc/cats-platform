import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

import type { PlatformSurfaceId } from '../../shared/platform-contract.js';

export interface ProductSurfaceModule {
  default: ComponentType;
}

export type ProductSurfaceLoader = () => Promise<ProductSurfaceModule>;

export const loadChatApp: ProductSurfaceLoader = () => import('../../products/chat/renderer/App.js');
export const loadWorkApp: ProductSurfaceLoader = () => import('../../products/work/renderer/App.js');
export const loadCodeApp: ProductSurfaceLoader = () => import('../../products/code/renderer/App.js');

const PRODUCT_SURFACE_LOADERS: Record<PlatformSurfaceId, ProductSurfaceLoader> = {
  chat: loadChatApp,
  work: loadWorkApp,
  code: loadCodeApp,
};

export function resolveProductSurfaceLoader(surface: PlatformSurfaceId): ProductSurfaceLoader {
  return PRODUCT_SURFACE_LOADERS[surface];
}

export function createLazyProductSurface(
  surface: PlatformSurfaceId,
): LazyExoticComponent<ComponentType> {
  return lazy(resolveProductSurfaceLoader(surface));
}

export function prefetchProductSurface(surface: PlatformSurfaceId): Promise<ProductSurfaceModule> {
  return resolveProductSurfaceLoader(surface)();
}
