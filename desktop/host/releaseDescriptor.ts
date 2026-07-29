import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  DesktopDistributionMode,
  DesktopUpdateChannel,
  DesktopUpdateProvider,
  DesktopUpdateUnavailableReason,
} from './contracts.js';

/**
 * Provenance emitted by the tag-gated release workflow
 * (`scripts/generate-desktop-release-descriptor.mjs`). SPEC-111 requires
 * official update capability to depend on this file rather than on
 * `app.isPackaged`, which is also true for locally packaged and unofficial
 * builds.
 *
 * Nothing in this module reads the environment. Requirement 1.9 states that no
 * environment variable may promote a development or unofficial package into an
 * official update client, and the cheapest way to guarantee that is to give the
 * resolver no access to one.
 */

export const DESKTOP_RELEASE_DESCRIPTOR_SCHEMA_VERSION = 1;

export const DESKTOP_RELEASE_DESCRIPTOR_FILENAME = 'release-descriptor.json';

export const DESKTOP_RELEASE_PLATFORMS = ['windows', 'macos', 'linux'] as const;

export type DesktopReleasePlatform = typeof DESKTOP_RELEASE_PLATFORMS[number];

/**
 * The distribution vocabulary lives in contracts.ts because Tray, Settings, and
 * the preload bridge all consume it. This module owns only how the values are
 * derived from the packaged descriptor.
 */
export type DesktopDistributionUnavailableReason = DesktopUpdateUnavailableReason;

export interface DesktopReleaseDescriptor {
  schemaVersion: number;
  tag: string;
  version: string;
  commit: string;
  platform: DesktopReleasePlatform;
  channel: 'stable';
  provider: 'github_release';
  repository: string;
  /** Commit of the cats-runtime checkout packaged alongside this build. */
  runtimeCommit: string;
  generatedAt: string | null;
}

export interface DesktopDistributionIdentity {
  distribution: DesktopDistributionMode;
  provider: DesktopUpdateProvider;
  channel: DesktopUpdateChannel;
  currentVersion: string;
  repository: string | null;
  commit: string | null;
  unavailableReason: DesktopDistributionUnavailableReason | null;
}

export type ParseReleaseDescriptorResult =
  | { ok: true; descriptor: DesktopReleaseDescriptor }
  | { ok: false; reason: DesktopDistributionUnavailableReason; detail: string };

const SEMVER_CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/iu;
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function resolveDesktopReleasePlatform(
  nodePlatform: NodeJS.Platform | string,
): DesktopReleasePlatform | null {
  if (nodePlatform === 'win32') {
    return 'windows';
  }
  if (nodePlatform === 'darwin') {
    return 'macos';
  }
  if (nodePlatform === 'linux') {
    return 'linux';
  }
  return null;
}

export function resolveDesktopReleaseDescriptorPath(
  moduleDir: string = dirname(fileURLToPath(import.meta.url)),
): string {
  // The descriptor is generated into build/desktop next to the compiled host,
  // so the same relative lookup works for a dev run and inside the asar.
  return join(moduleDir, DESKTOP_RELEASE_DESCRIPTOR_FILENAME);
}

export function parseDesktopReleaseDescriptor(raw: unknown): ParseReleaseDescriptorResult {
  if (!isObjectRecord(raw)) {
    return { ok: false, reason: 'descriptor_malformed', detail: 'Descriptor is not an object.' };
  }

  if (raw.schemaVersion !== DESKTOP_RELEASE_DESCRIPTOR_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'descriptor_schema_unsupported',
      detail: `Unsupported descriptor schemaVersion: ${String(raw.schemaVersion)}`,
    };
  }

  const version = readString(raw, 'version');
  if (version === null || !SEMVER_CORE.test(version)) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: 'Descriptor version is not a MAJOR.MINOR.PATCH string.',
    };
  }

  const tag = readString(raw, 'tag');
  if (tag === null || tag !== `v${version}`) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: 'Descriptor tag does not match its version.',
    };
  }

  const commit = readString(raw, 'commit');
  if (commit === null || !COMMIT_SHA.test(commit)) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: 'Descriptor commit is not a full 40-character sha.',
    };
  }

  const platform = readString(raw, 'platform');
  if (
    platform === null
    || !(DESKTOP_RELEASE_PLATFORMS as readonly string[]).includes(platform)
  ) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: 'Descriptor platform is not windows, macos, or linux.',
    };
  }

  // Phase 1 publishes stable only, and Requirement 1.7 pins the production
  // channel to the descriptor. Any other channel means the file was not
  // produced by the current release workflow.
  if (raw.channel !== 'stable') {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: `Descriptor channel is not stable: ${String(raw.channel)}`,
    };
  }

  if (raw.provider !== 'github_release') {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: `Descriptor provider is not github_release: ${String(raw.provider)}`,
    };
  }

  const repository = readString(raw, 'repository');
  if (repository === null || !GITHUB_REPOSITORY.test(repository)) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: 'Descriptor repository is not in owner/name form.',
    };
  }

  const runtimeCommit = readString(raw, 'runtimeCommit');
  if (runtimeCommit === null || !COMMIT_SHA.test(runtimeCommit)) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: 'Descriptor runtimeCommit is not a full 40-character sha.',
    };
  }

  return {
    ok: true,
    descriptor: {
      schemaVersion: DESKTOP_RELEASE_DESCRIPTOR_SCHEMA_VERSION,
      tag,
      version,
      commit: commit.toLowerCase(),
      platform: platform as DesktopReleasePlatform,
      channel: 'stable',
      provider: 'github_release',
      repository,
      runtimeCommit: runtimeCommit.toLowerCase(),
      generatedAt: readString(raw, 'generatedAt'),
    },
  };
}

export interface ResolveDesktopDistributionIdentityInput {
  isPackaged: boolean;
  currentVersion: string;
  nodePlatform: NodeJS.Platform | string;
  descriptor: ParseReleaseDescriptorResult | null;
}

function unofficial(
  currentVersion: string,
  reason: DesktopDistributionUnavailableReason,
): DesktopDistributionIdentity {
  return {
    distribution: 'unofficial_packaged',
    provider: 'none',
    channel: 'stable',
    currentVersion,
    repository: null,
    commit: null,
    unavailableReason: reason,
  };
}

export function resolveDesktopDistributionIdentity(
  input: ResolveDesktopDistributionIdentityInput,
): DesktopDistributionIdentity {
  const { isPackaged, currentVersion, nodePlatform, descriptor } = input;

  if (!isPackaged) {
    return {
      distribution: 'development',
      provider: 'none',
      channel: 'stable',
      currentVersion,
      repository: null,
      commit: null,
      unavailableReason: 'development_build',
    };
  }

  if (descriptor === null) {
    return unofficial(currentVersion, 'descriptor_missing');
  }

  if (!descriptor.ok) {
    return unofficial(currentVersion, descriptor.reason);
  }

  if (descriptor.descriptor.version !== currentVersion) {
    return unofficial(currentVersion, 'descriptor_version_mismatch');
  }

  if (descriptor.descriptor.platform !== resolveDesktopReleasePlatform(nodePlatform)) {
    return unofficial(currentVersion, 'descriptor_platform_mismatch');
  }

  return {
    distribution: 'official_packaged',
    provider: 'github_release',
    channel: descriptor.descriptor.channel,
    currentVersion,
    repository: descriptor.descriptor.repository,
    commit: descriptor.descriptor.commit,
    unavailableReason: null,
  };
}

export interface LoadDesktopReleaseDescriptorDependencies {
  readFileImpl?: (path: string) => Promise<string>;
}

/**
 * Returns null when the descriptor is absent, which is the expected state for a
 * development run and for a locally packaged build. A present but unreadable or
 * invalid file is reported as a parse failure so the reason reaches diagnostics
 * instead of silently degrading to "missing".
 */
export async function loadDesktopReleaseDescriptor(
  descriptorPath: string = resolveDesktopReleaseDescriptorPath(),
  dependencies: LoadDesktopReleaseDescriptorDependencies = {},
): Promise<ParseReleaseDescriptorResult | null> {
  const readFileImpl = dependencies.readFileImpl
    ?? ((path: string) => readFile(path, 'utf8'));

  let contents: string;
  try {
    contents = await readFileImpl(descriptorPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    return {
      ok: false,
      reason: 'descriptor_unreadable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    return {
      ok: false,
      reason: 'descriptor_malformed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return parseDesktopReleaseDescriptor(parsed);
}

function isMissingFileError(error: unknown): boolean {
  return isObjectRecord(error) && error.code === 'ENOENT';
}
