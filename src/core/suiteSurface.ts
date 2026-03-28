import type { SuiteSurfaceId } from '../shared/suite-contract.js';

interface SuiteSurfaceDescriptor {
  id: SuiteSurfaceId;
  routePrefix: `/${string}`;
  productName: string;
  subtitle: string;
}

const SUITE_SURFACE_DESCRIPTORS: readonly SuiteSurfaceDescriptor[] = [
  {
    id: 'chat',
    routePrefix: '/chat',
    productName: 'Cats Chat',
    subtitle: 'Conversations with companions and personal agents',
  },
  {
    id: 'work',
    routePrefix: '/work',
    productName: 'Cats Work',
    subtitle: 'Projects, approvals, and operator workflow',
  },
  {
    id: 'code',
    routePrefix: '/code',
    productName: 'Cats Code',
    subtitle: 'Repos, runs, and coding workspace',
  },
];

export function listSuiteSurfaceDescriptors(): SuiteSurfaceDescriptor[] {
  return SUITE_SURFACE_DESCRIPTORS.map((descriptor) => ({ ...descriptor }));
}

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

export function suiteSurfaceSubtitle(surface: SuiteSurfaceId): string {
  return SUITE_SURFACE_DESCRIPTORS.find((descriptor) => descriptor.id === surface)?.subtitle
    ?? 'Conversations with companions and personal agents';
}

export function suiteSurfaceRoutePrefix(surface: SuiteSurfaceId): `/${string}` {
  return SUITE_SURFACE_DESCRIPTORS.find((descriptor) => descriptor.id === surface)?.routePrefix
    ?? '/chat';
}
