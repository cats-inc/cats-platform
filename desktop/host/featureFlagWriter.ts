import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Desktop main owns the feature-flag writer in local-first packaged mode
 * (PLAN-077 §"One owner per runtime mode"). The cats-platform sidecar's
 * HTTP route is disabled when `CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS=1`
 * is set on its env, so this module is the only path that may persist
 * a flag write.
 *
 * The implementation duplicates the core production-guard rules from
 * `src/shared/featureFlags.ts` so desktop main can run without sharing
 * a tsconfig with the sidecar. The two registries must stay in sync —
 * if a new flag is added on the sidecar side, mirror it here too.
 */

export const COMPANION_PROFILE_IA_FLAG = 'cats.chat.companionProfileIA';

export type DesktopFeatureFlagBuildChannel = 'development' | 'production';

export type DesktopFeatureFlagProductionUnlockState = 'locked' | 'unlocked';

export interface DesktopFeatureFlagRegistryEntry {
  name: string;
  productionUnlockState: DesktopFeatureFlagProductionUnlockState;
  unlockRequirement?: string;
}

const DESKTOP_FEATURE_FLAG_REGISTRY: Readonly<Record<string, DesktopFeatureFlagRegistryEntry>> =
  Object.freeze({
    [COMPANION_PROFILE_IA_FLAG]: {
      name: COMPANION_PROFILE_IA_FLAG,
      productionUnlockState: 'locked',
      unlockRequirement: 'phase2_profile_read_model_guards',
    },
  });

export type DesktopSetFeatureFlagResult =
  | { status: 'ok'; previousValue: boolean | null; nextValue: boolean }
  | { status: 'unknown_flag'; name: string }
  | {
      status: 'feature_flag_blocked';
      name: string;
      reason: string;
      unlockRequirement?: string;
    };

export interface DesktopSetFeatureFlagInput {
  name: string;
  value: boolean;
  buildChannel: DesktopFeatureFlagBuildChannel;
  current?: Readonly<Record<string, boolean>>;
}

export function decideDesktopFeatureFlagWrite(
  input: DesktopSetFeatureFlagInput,
): DesktopSetFeatureFlagResult {
  const entry = DESKTOP_FEATURE_FLAG_REGISTRY[input.name];
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
      ...(entry.unlockRequirement ? { unlockRequirement: entry.unlockRequirement } : {}),
    };
  }
  const previousValue = input.current?.[input.name] ?? null;
  return { status: 'ok', previousValue, nextValue: input.value };
}

export async function readDesktopFeatureFlagsFile(
  filePath: string,
): Promise<Record<string, boolean>> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isPlainObject(parsed)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export async function writeDesktopFeatureFlagsFile(
  filePath: string,
  flags: Readonly<Record<string, boolean>>,
): Promise<void> {
  const sanitized: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'boolean') sanitized[key] = value;
  }
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function applyDesktopFeatureFlagWrite(input: {
  filePath: string;
  name: string;
  value: boolean;
  buildChannel: DesktopFeatureFlagBuildChannel;
}): Promise<DesktopSetFeatureFlagResult> {
  const current = await readDesktopFeatureFlagsFile(input.filePath);
  const decision = decideDesktopFeatureFlagWrite({
    name: input.name,
    value: input.value,
    buildChannel: input.buildChannel,
    current,
  });
  if (decision.status === 'ok') {
    await writeDesktopFeatureFlagsFile(input.filePath, {
      ...current,
      [input.name]: decision.nextValue,
    });
  }
  return decision;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
