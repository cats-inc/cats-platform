import type {
  SuiteProductDescriptor,
  SuiteProductId,
  SuiteSurfaceId,
} from './suite-contract.js';

const SUITE_PRODUCT_DESCRIPTORS: readonly SuiteProductDescriptor[] = [
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
      supportsFirstCat: true,
    },
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
      selectable: false,
      disabledReason: 'Coming soon',
      supportsFirstCat: false,
    },
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
      selectable: false,
      disabledReason: 'Coming soon',
      supportsFirstCat: false,
    },
  },
] as const;

export function listSuiteProductDescriptors(): SuiteProductDescriptor[] {
  return SUITE_PRODUCT_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    setup: { ...descriptor.setup },
  }));
}

export function getSuiteProductDescriptor(productId: SuiteProductId): SuiteProductDescriptor | null {
  const matched = SUITE_PRODUCT_DESCRIPTORS.find((descriptor) => descriptor.id === productId);
  if (!matched) {
    return null;
  }
  return {
    ...matched,
    setup: { ...matched.setup },
  };
}

export function getSuiteProductBySurface(surface: SuiteSurfaceId): SuiteProductDescriptor | null {
  const matched = SUITE_PRODUCT_DESCRIPTORS.find((descriptor) => descriptor.surface === surface);
  if (!matched) {
    return null;
  }
  return {
    ...matched,
    setup: { ...matched.setup },
  };
}
