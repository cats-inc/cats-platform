import type {
  PlatformBuildChannel,
  PlatformFeatureFlags,
} from './platform-contract.js';

/**
 * Production-unlock state for a feature flag registry entry.
 *
 * - `locked`: production builds reject `true` writes and coerce a stored
 *   `true` back to `false` on every read. Development builds still honour the
 *   raw value so dev/test surfaces can exercise the gated code path.
 * - `unlocked`: no production guard. The plan flips this from `locked` to
 *   `unlocked` exactly once when the gating phase ships (e.g., Phase 2 of
 *   PLAN-077 unlocks `cats.chat.companionProfileIA`).
 */
export type FeatureFlagProductionUnlockState = 'locked' | 'unlocked';

export interface FeatureFlagRegistryEntry {
  name: string;
  description: string;
  productionUnlockState: FeatureFlagProductionUnlockState;
  /**
   * Free-form pointer to the unlock condition (e.g.
   * `'phase2_profile_read_model_guards'`). Used in operator diagnostics and
   * the typed write rejection reason; not parsed by the writer.
   */
  unlockRequirement?: string;
}

export type FeatureFlagRegistry = Readonly<Record<string, FeatureFlagRegistryEntry>>;

export type SetFeatureFlagResult =
  | { status: 'ok'; previousValue: boolean | null; nextValue: boolean }
  | { status: 'unknown_flag'; name: string }
  | {
      status: 'feature_flag_blocked';
      name: string;
      reason: string;
      unlockRequirement?: string;
    };

/**
 * The PLAN-077 release flag. Locked in production until Phase 2 lands the
 * profile read-model guards (Posts producer, classifier, Inspector
 * lifecycle, Activity aggregation); the unlock flips this entry's
 * `productionUnlockState` to `'unlocked'` atomically.
 */
export const COMPANION_PROFILE_IA_FLAG = 'cats.chat.companionProfileIA';

export const DEFAULT_FEATURE_FLAG_REGISTRY: FeatureFlagRegistry = Object.freeze({
  [COMPANION_PROFILE_IA_FLAG]: {
    name: COMPANION_PROFILE_IA_FLAG,
    description:
      'Gates the PLAN-077 companion profile / library IA on the chat companion '
      + 'surface (tabs, side-panel rename, header button states).',
    productionUnlockState: 'locked',
    unlockRequirement: 'phase2_profile_read_model_guards',
  },
});

export interface SetFeatureFlagInput {
  name: string;
  value: boolean;
  buildChannel: PlatformBuildChannel;
  registry?: FeatureFlagRegistry;
  /** Current persisted state, indexed by flag name. Defaults to {}. */
  current?: PlatformFeatureFlags;
}

/**
 * Decide whether a feature-flag write should be accepted, blocked by the
 * production guard, or rejected as unknown. Pure: callers persist the
 * `nextValue` themselves (Slice 3 wires the desktop persistence path).
 */
export function setFeatureFlag(input: SetFeatureFlagInput): SetFeatureFlagResult {
  const registry = input.registry ?? DEFAULT_FEATURE_FLAG_REGISTRY;
  const entry = registry[input.name];
  if (!entry) {
    return { status: 'unknown_flag', name: input.name };
  }
  const productionLocked =
    input.buildChannel === 'production'
    && entry.productionUnlockState === 'locked';
  if (productionLocked && input.value === true) {
    return {
      status: 'feature_flag_blocked',
      name: input.name,
      reason: entry.unlockRequirement
        ? `feature_flag_blocked: ${entry.unlockRequirement}`
        : 'feature_flag_blocked',
      ...(entry.unlockRequirement
        ? { unlockRequirement: entry.unlockRequirement }
        : {}),
    };
  }
  const previousValue = input.current?.[input.name] ?? null;
  return { status: 'ok', previousValue, nextValue: input.value };
}

/**
 * Coerce a raw persisted feature-flag map for read-side consumption. On a
 * production build, every locked-registry entry is forced to `false`
 * regardless of what is stored on disk; a dev install whose data root is
 * later run on a production build cannot inadvertently flip the gated UI on.
 */
export function coerceFeatureFlagsForRead(input: {
  raw: PlatformFeatureFlags;
  buildChannel: PlatformBuildChannel;
  registry?: FeatureFlagRegistry;
}): PlatformFeatureFlags {
  const registry = input.registry ?? DEFAULT_FEATURE_FLAG_REGISTRY;
  if (input.buildChannel !== 'production') {
    return Object.freeze({ ...input.raw });
  }
  const coerced: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(input.raw)) {
    const entry = registry[name];
    if (!entry) {
      coerced[name] = value;
      continue;
    }
    if (entry.productionUnlockState === 'locked' && value === true) {
      coerced[name] = false;
      continue;
    }
    coerced[name] = value;
  }
  return Object.freeze(coerced);
}

/**
 * Convenience: read a single coerced flag value from a raw map. Returns
 * `false` for unknown names so the call-site never has to hand-default.
 */
export function readCoercedFeatureFlag(input: {
  name: string;
  raw: PlatformFeatureFlags;
  buildChannel: PlatformBuildChannel;
  registry?: FeatureFlagRegistry;
}): boolean {
  const coerced = coerceFeatureFlagsForRead({
    raw: input.raw,
    buildChannel: input.buildChannel,
    registry: input.registry,
  });
  return coerced[input.name] === true;
}
