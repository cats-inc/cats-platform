// PLAN-028 Phase 4 — Background activity surface convention.
//
// Activities created by Work intake / template / agent code are recorded for
// audit/replay but should not surface in the operator-facing Work timeline by
// default. We mark them via metadata so the projection layer can filter.
//
// Convention: metadata.surface = 'operator' | 'background'
// Default (missing field) = 'operator' for backward compatibility.

import type { CoreRecordMetadata } from '../../../core/types.js';

export const WORK_ACTIVITY_SURFACE_OPERATOR = 'operator' as const;
export const WORK_ACTIVITY_SURFACE_BACKGROUND = 'background' as const;

export type WorkActivitySurface =
  | typeof WORK_ACTIVITY_SURFACE_OPERATOR
  | typeof WORK_ACTIVITY_SURFACE_BACKGROUND;

export function readActivitySurface(
  metadata: CoreRecordMetadata | undefined,
): WorkActivitySurface {
  if (!metadata || typeof metadata !== 'object') {
    return WORK_ACTIVITY_SURFACE_OPERATOR;
  }
  const value = (metadata as Record<string, unknown>).surface;
  if (value === WORK_ACTIVITY_SURFACE_BACKGROUND) {
    return WORK_ACTIVITY_SURFACE_BACKGROUND;
  }
  return WORK_ACTIVITY_SURFACE_OPERATOR;
}

export function withBackgroundActivitySurface(
  base: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    surface: WORK_ACTIVITY_SURFACE_BACKGROUND,
  };
}
