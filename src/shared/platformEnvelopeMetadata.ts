import type { RuntimeStatusSummary } from '../runtime/client.js';
import type {
  PlatformAppDescriptor,
  PlatformResponseMetadata,
} from './platform-contract.js';
import { PLATFORM_RUNTIME_ROOT_PATH } from './runtimeIngressPaths.js';

export const PLATFORM_APP_NAME = 'cats-platform';
export const PLATFORM_APP_STAGE = 'phase-2-shell';
export const PLATFORM_RUNTIME_BOUNDARY = 'cats-runtime';
export const PLATFORM_RUNTIME_SERVICE = 'cats-runtime';

const PLATFORM_APP_DESCRIPTOR: PlatformAppDescriptor = {
  name: PLATFORM_APP_NAME,
  stage: PLATFORM_APP_STAGE,
  runtimeBoundary: PLATFORM_RUNTIME_BOUNDARY,
};

export function createPlatformAppDescriptor(): PlatformAppDescriptor {
  return { ...PLATFORM_APP_DESCRIPTOR };
}

export function attachPlatformRuntimeRoot(
  runtime: RuntimeStatusSummary,
): RuntimeStatusSummary {
  return {
    ...runtime,
    baseUrl: PLATFORM_RUNTIME_ROOT_PATH,
    externalBaseUrl: runtime.externalBaseUrl ?? runtime.baseUrl,
  };
}

export function createPlatformWarmRuntimeSummary(): RuntimeStatusSummary {
  return {
    baseUrl: PLATFORM_RUNTIME_ROOT_PATH,
    reachable: false,
    status: 'warm',
    service: PLATFORM_RUNTIME_SERVICE,
  };
}

export function createPlatformResponseMetadata(input: {
  host: string;
  port: number;
  generatedAt: Date;
}): PlatformResponseMetadata {
  return {
    generatedAt: input.generatedAt.toISOString(),
    host: input.host,
    port: input.port,
  };
}
