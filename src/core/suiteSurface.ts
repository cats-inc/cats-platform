import type { SuiteSurfaceId } from '../shared/suite-contract.js';

interface SuiteSurfaceDescriptor {
  id: SuiteSurfaceId;
  routePrefix: `/${string}`;
  productName: string;
}

const SUITE_SURFACE_DESCRIPTORS: readonly SuiteSurfaceDescriptor[] = [
  {
    id: 'chat',
    routePrefix: '/chat',
    productName: 'Cats Chat',
  },
  {
    id: 'work',
    routePrefix: '/work',
    productName: 'Cats Work',
  },
  {
    id: 'code',
    routePrefix: '/code',
    productName: 'Cats Code',
  },
];

export function resolveSuiteSurfaceFromPath(pathname: string): SuiteSurfaceId {
  const matchedDescriptor = SUITE_SURFACE_DESCRIPTORS.find((descriptor) =>
    pathname === descriptor.routePrefix || pathname.startsWith(`${descriptor.routePrefix}/`),
  );
  return matchedDescriptor?.id ?? 'chat';
}

export function suiteSurfaceProductName(surface: SuiteSurfaceId): string {
  return SUITE_SURFACE_DESCRIPTORS.find((descriptor) => descriptor.id === surface)?.productName
    ?? 'Cats Chat';
}
