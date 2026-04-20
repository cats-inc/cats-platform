import type {
  PlatformProductDescriptor,
  PlatformProductId,
  PlatformSurfaceId,
} from './platform-contract.js';

const PLATFORM_PRODUCT_DESCRIPTORS: readonly PlatformProductDescriptor[] = [
  {
    id: 'chat',
    surface: 'chat',
    routePrefix: '/chat',
    productName: 'Cats Chat',
    subtitle: 'Conversations with companions and personal agents',
    group: 'home',
    installPolicy: 'required',
    installState: 'installed',
    maturity: 'active',
    setup: {
      selectable: true,
    },
    settings: [
      {
        id: 'chat',
        label: 'Chat',
        path: '/settings/chat',
      },
    ],
  },
  {
    id: 'code',
    surface: 'code',
    routePrefix: '/code',
    productName: 'Cats Code',
    subtitle: 'Repos, runs, and coding workspace',
    group: 'office',
    installPolicy: 'required',
    installState: 'installed',
    maturity: 'preview',
    setup: {
      selectable: true,
    },
    settings: [
      {
        id: 'code',
        label: 'Code',
        path: '/settings/code',
      },
    ],
  },
  {
    id: 'work',
    surface: 'work',
    routePrefix: '/work',
    productName: 'Cats Work',
    subtitle: 'Projects, approvals, and operator workflow',
    group: 'office',
    installPolicy: 'required',
    installState: 'installed',
    maturity: 'preview',
    setup: {
      selectable: true,
    },
    settings: [
      {
        id: 'work',
        label: 'Work',
        path: '/settings/work',
      },
    ],
  },
] as const;

const PLATFORM_PRODUCT_DESCRIPTOR_BY_ID = new Map(
  PLATFORM_PRODUCT_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor] as const),
);

const PLATFORM_PRODUCT_DESCRIPTOR_BY_SURFACE = new Map(
  PLATFORM_PRODUCT_DESCRIPTORS
    .filter((descriptor): descriptor is PlatformProductDescriptor & { surface: PlatformSurfaceId } =>
      descriptor.surface !== null)
    .map((descriptor) => [descriptor.surface, descriptor] as const),
);

function clonePlatformProductDescriptor(descriptor: PlatformProductDescriptor): PlatformProductDescriptor {
  return {
    ...descriptor,
    setup: { ...descriptor.setup },
    settings: descriptor.settings?.map((entry) => ({ ...entry })),
  };
}

export function listPlatformProductDescriptors(): PlatformProductDescriptor[] {
  return PLATFORM_PRODUCT_DESCRIPTORS.map(clonePlatformProductDescriptor);
}

export function getPlatformProductDescriptor(productId: PlatformProductId): PlatformProductDescriptor | null {
  const matched = PLATFORM_PRODUCT_DESCRIPTOR_BY_ID.get(productId);
  if (!matched) {
    return null;
  }
  return clonePlatformProductDescriptor(matched);
}

export function getPlatformProductBySurface(surface: PlatformSurfaceId): PlatformProductDescriptor | null {
  const matched = PLATFORM_PRODUCT_DESCRIPTOR_BY_SURFACE.get(surface);
  if (!matched) {
    return null;
  }
  return clonePlatformProductDescriptor(matched);
}

export function resolvePlatformSurfaceRoutePrefix(surface: PlatformSurfaceId): `/${string}` {
  return PLATFORM_PRODUCT_DESCRIPTOR_BY_SURFACE.get(surface)?.routePrefix ?? '/chat';
}

export function resolvePlatformSurfaceProductName(surface: PlatformSurfaceId): string {
  return PLATFORM_PRODUCT_DESCRIPTOR_BY_SURFACE.get(surface)?.productName ?? 'Cats Chat';
}

export function resolvePlatformSurfaceSubtitle(surface: PlatformSurfaceId): string {
  return PLATFORM_PRODUCT_DESCRIPTOR_BY_SURFACE.get(surface)?.subtitle
    ?? 'Conversations with companions and personal agents';
}
