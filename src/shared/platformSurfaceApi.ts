import type { PlatformSurfaceId } from './platform-contract.js';

export const PLATFORM_CHAT_API_BASE = null;
export const PLATFORM_WORK_API_BASE = '/api/work';
export const PLATFORM_CODE_API_BASE = '/api/code';

export const PLATFORM_SURFACE_API_BASES: Readonly<Record<PlatformSurfaceId, string | null>> = {
  chat: PLATFORM_CHAT_API_BASE,
  work: PLATFORM_WORK_API_BASE,
  code: PLATFORM_CODE_API_BASE,
};

export function resolvePlatformSurfaceApiBase(surface: PlatformSurfaceId): string | null {
  return PLATFORM_SURFACE_API_BASES[surface] ?? null;
}
