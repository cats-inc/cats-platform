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
] as const;

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
  const matched = PLATFORM_PRODUCT_DESCRIPTORS.find((descriptor) => descriptor.id === productId);
  if (!matched) {
    return null;
  }
  return clonePlatformProductDescriptor(matched);
}

export function getPlatformProductBySurface(surface: PlatformSurfaceId): PlatformProductDescriptor | null {
  const matched = PLATFORM_PRODUCT_DESCRIPTORS.find((descriptor) => descriptor.surface === surface);
  if (!matched) {
    return null;
  }
  return clonePlatformProductDescriptor(matched);
}
