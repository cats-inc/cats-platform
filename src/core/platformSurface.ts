import type { PlatformProductMaturity, PlatformSurfaceId } from '../shared/platform-contract.js';
import { listPlatformProductDescriptors } from '../shared/platformProducts.js';

interface PlatformSurfaceDescriptor {
  id: PlatformSurfaceId;
  routePrefix: `/${string}`;
  productName: string;
  subtitle: string;
  maturity: PlatformProductMaturity;
}

const PLATFORM_SURFACE_DESCRIPTORS: readonly PlatformSurfaceDescriptor[] = listPlatformProductDescriptors()
  .filter((descriptor) => descriptor.surface !== null)
  .map((descriptor) => ({
    id: descriptor.surface!,
    routePrefix: descriptor.routePrefix,
    productName: descriptor.productName,
    subtitle: descriptor.subtitle,
    maturity: descriptor.maturity,
  }));

const PLATFORM_SURFACE_DESCRIPTOR_BY_ID = new Map(
  PLATFORM_SURFACE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor] as const),
);

export function listPlatformSurfaceDescriptors(): readonly PlatformSurfaceDescriptor[] {
  return PLATFORM_SURFACE_DESCRIPTORS;
}

export function resolvePlatformSurfaceFromPath(pathname: string): PlatformSurfaceId {
  const matchedDescriptor = PLATFORM_SURFACE_DESCRIPTORS.find((descriptor) =>
    pathname === descriptor.routePrefix || pathname.startsWith(`${descriptor.routePrefix}/`),
  );
  return matchedDescriptor?.id ?? 'chat';
}

export function platformSurfaceProductName(surface: PlatformSurfaceId): string {
  return PLATFORM_SURFACE_DESCRIPTOR_BY_ID.get(surface)?.productName
    ?? 'Cats Chat';
}

export function platformSurfaceSubtitle(surface: PlatformSurfaceId): string {
  return PLATFORM_SURFACE_DESCRIPTOR_BY_ID.get(surface)?.subtitle
    ?? 'Conversations with companions and personal agents';
}

export function platformSurfaceRoutePrefix(surface: PlatformSurfaceId): `/${string}` {
  return PLATFORM_SURFACE_DESCRIPTOR_BY_ID.get(surface)?.routePrefix
    ?? '/chat';
}
