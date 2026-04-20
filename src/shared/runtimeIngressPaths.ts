export type PlatformRuntimeSurface = 'setup' | 'dashboard' | 'playground';

const PLATFORM_RUNTIME_SURFACE_PATHS = {
  setup: '/runtime/setup',
  dashboard: '/runtime/dashboard',
  playground: '/runtime/playground',
} as const satisfies Record<PlatformRuntimeSurface, string>;

export const PLATFORM_RUNTIME_SETUP_PATH = PLATFORM_RUNTIME_SURFACE_PATHS.setup;
export const PLATFORM_RUNTIME_DASHBOARD_PATH = PLATFORM_RUNTIME_SURFACE_PATHS.dashboard;
export const PLATFORM_RUNTIME_PLAYGROUND_PATH = PLATFORM_RUNTIME_SURFACE_PATHS.playground;

export function resolvePlatformRuntimeSurfacePath(
  surface: PlatformRuntimeSurface,
): string {
  return PLATFORM_RUNTIME_SURFACE_PATHS[surface];
}
