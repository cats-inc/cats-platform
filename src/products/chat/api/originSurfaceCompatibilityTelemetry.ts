import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';

export interface OriginSurfaceCompatibilityFallbackSample {
  targetNoun: string;
  resolvedSurface: PlatformSurfaceId;
}

export interface OriginSurfaceCompatibilityTelemetrySnapshot {
  fallbackCount: number;
  fallbackTargetCounts: Record<string, number>;
  latestFallback: OriginSurfaceCompatibilityFallbackSample | null;
}

const originSurfaceCompatibilityTelemetry: OriginSurfaceCompatibilityTelemetrySnapshot = {
  fallbackCount: 0,
  fallbackTargetCounts: {},
  latestFallback: null,
};

export function recordOriginSurfaceCompatibilityFallback(
  targetNoun: string,
  resolvedSurface: PlatformSurfaceId,
): void {
  originSurfaceCompatibilityTelemetry.fallbackCount += 1;
  originSurfaceCompatibilityTelemetry.fallbackTargetCounts[targetNoun]
    = (originSurfaceCompatibilityTelemetry.fallbackTargetCounts[targetNoun] ?? 0) + 1;
  originSurfaceCompatibilityTelemetry.latestFallback = {
    targetNoun,
    resolvedSurface,
  };
}

export function inspectOriginSurfaceCompatibilityTelemetry(): OriginSurfaceCompatibilityTelemetrySnapshot {
  return {
    fallbackCount: originSurfaceCompatibilityTelemetry.fallbackCount,
    fallbackTargetCounts: { ...originSurfaceCompatibilityTelemetry.fallbackTargetCounts },
    latestFallback: originSurfaceCompatibilityTelemetry.latestFallback
      ? { ...originSurfaceCompatibilityTelemetry.latestFallback }
      : null,
  };
}

export function resetOriginSurfaceCompatibilityTelemetry(): void {
  originSurfaceCompatibilityTelemetry.fallbackCount = 0;
  originSurfaceCompatibilityTelemetry.fallbackTargetCounts = {};
  originSurfaceCompatibilityTelemetry.latestFallback = null;
}
