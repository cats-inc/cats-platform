import type { PlatformFeatureFlags } from './platform-contract.js';

/**
 * Cats has never shipped publicly (see cats-platform/AGENTS.md
 * "Pre-Release Compatibility Policy"), so this registry is just a list
 * of recognised flag names. Writers reject unknown names; everything
 * else is accepted as-is.
 */

export interface FeatureFlagRegistryEntry {
  name: string;
  description: string;
}

export type FeatureFlagRegistry = Readonly<Record<string, FeatureFlagRegistryEntry>>;

export type SetFeatureFlagResult =
  | { status: 'ok'; previousValue: boolean | null; nextValue: boolean }
  | { status: 'unknown_flag'; name: string };

export const COMPANION_PROFILE_IA_FLAG = 'cats.chat.companionProfileIA';

export const DEFAULT_FEATURE_FLAG_REGISTRY: FeatureFlagRegistry = Object.freeze({
  [COMPANION_PROFILE_IA_FLAG]: {
    name: COMPANION_PROFILE_IA_FLAG,
    description:
      'Gates the PLAN-077 companion profile / library IA on the chat companion '
      + 'surface (tabs, side-panel rename, header button states).',
  },
});

export interface SetFeatureFlagInput {
  name: string;
  value: boolean;
  registry?: FeatureFlagRegistry;
  /** Current persisted state, indexed by flag name. Defaults to {}. */
  current?: PlatformFeatureFlags;
}

export function setFeatureFlag(input: SetFeatureFlagInput): SetFeatureFlagResult {
  const registry = input.registry ?? DEFAULT_FEATURE_FLAG_REGISTRY;
  const entry = registry[input.name];
  if (!entry) {
    return { status: 'unknown_flag', name: input.name };
  }
  const previousValue = input.current?.[input.name] ?? null;
  return { status: 'ok', previousValue, nextValue: input.value };
}

export function readFeatureFlag(input: {
  name: string;
  raw: PlatformFeatureFlags;
}): boolean {
  return input.raw[input.name] === true;
}
