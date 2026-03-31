import type { SuiteProductMaturity, SuiteSurfaceId } from '../shared/suite-contract.js';
import { listSuiteProductDescriptors } from '../shared/suiteProducts.js';

interface SuiteSurfaceDescriptor {
  id: SuiteSurfaceId;
  routePrefix: `/${string}`;
  productName: string;
  subtitle: string;
  maturity: SuiteProductMaturity;
}

const SUITE_SURFACE_DESCRIPTORS: readonly SuiteSurfaceDescriptor[] = listSuiteProductDescriptors()
  .filter((descriptor) => descriptor.surface !== null)
  .map((descriptor) => ({
    id: descriptor.surface!,
    routePrefix: descriptor.routePrefix,
    productName: descriptor.productName,
    subtitle: descriptor.subtitle,
    maturity: descriptor.maturity,
  }));

const SUITE_SURFACE_DESCRIPTOR_BY_ID = new Map(
  SUITE_SURFACE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor] as const),
);

export function listSuiteSurfaceDescriptors(): readonly SuiteSurfaceDescriptor[] {
  return SUITE_SURFACE_DESCRIPTORS;
}

export function resolveSuiteSurfaceFromPath(pathname: string): SuiteSurfaceId {
  const matchedDescriptor = SUITE_SURFACE_DESCRIPTORS.find((descriptor) =>
    pathname === descriptor.routePrefix || pathname.startsWith(`${descriptor.routePrefix}/`),
  );
  return matchedDescriptor?.id ?? 'chat';
}

export function suiteSurfaceProductName(surface: SuiteSurfaceId): string {
  return SUITE_SURFACE_DESCRIPTOR_BY_ID.get(surface)?.productName
    ?? 'Cats Chat';
}

export function suiteSurfaceSubtitle(surface: SuiteSurfaceId): string {
  return SUITE_SURFACE_DESCRIPTOR_BY_ID.get(surface)?.subtitle
    ?? 'Conversations with companions and personal agents';
}

export function suiteSurfaceRoutePrefix(surface: SuiteSurfaceId): `/${string}` {
  return SUITE_SURFACE_DESCRIPTOR_BY_ID.get(surface)?.routePrefix
    ?? '/chat';
}
