import type { SuiteProductMaturity, SuiteSurfaceId } from '../shared/suite-contract.js';
import { listSuiteProductDescriptors } from '../shared/suiteProducts.js';

interface SuiteSurfaceDescriptor {
  id: SuiteSurfaceId;
  routePrefix: `/${string}`;
  productName: string;
  subtitle: string;
  maturity: SuiteProductMaturity;
}

export function listSuiteSurfaceDescriptors(): SuiteSurfaceDescriptor[] {
  return listSuiteProductDescriptors()
    .filter((descriptor) => descriptor.surface !== null)
    .map((descriptor) => ({
      id: descriptor.surface!,
      routePrefix: descriptor.routePrefix,
      productName: descriptor.productName,
      subtitle: descriptor.subtitle,
      maturity: descriptor.maturity,
    }));
}

export function resolveSuiteSurfaceFromPath(pathname: string): SuiteSurfaceId {
  const matchedDescriptor = listSuiteSurfaceDescriptors().find((descriptor) =>
    pathname === descriptor.routePrefix || pathname.startsWith(`${descriptor.routePrefix}/`),
  );
  return matchedDescriptor?.id ?? 'chat';
}

export function suiteSurfaceProductName(surface: SuiteSurfaceId): string {
  return listSuiteSurfaceDescriptors().find((descriptor) => descriptor.id === surface)?.productName
    ?? 'Cats Chat';
}

export function suiteSurfaceSubtitle(surface: SuiteSurfaceId): string {
  return listSuiteSurfaceDescriptors().find((descriptor) => descriptor.id === surface)?.subtitle
    ?? 'Conversations with companions and personal agents';
}

export function suiteSurfaceRoutePrefix(surface: SuiteSurfaceId): `/${string}` {
  return listSuiteSurfaceDescriptors().find((descriptor) => descriptor.id === surface)?.routePrefix
    ?? '/chat';
}
