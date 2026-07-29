#!/usr/bin/env node
//
// Script: generate-desktop-release-descriptor.mjs
// Description: Emit the non-secret provenance descriptor that marks a packaged
//              build as an official tag-gated desktop release. The desktop
//              host refuses to advertise self-update without it.
//
// Usage: node scripts/generate-desktop-release-descriptor.mjs [options]
//
// Options:
//   --tag <vX.Y.Z>        Release tag. Defaults to GITHUB_REF_NAME.
//   --commit <sha>        Source commit. Defaults to GITHUB_SHA.
//   --repository <o/r>    GitHub owner/repo. Defaults to GITHUB_REPOSITORY.
//   --platform <windows|macos|linux>
//                         Target platform. Defaults to the current platform.
//   --output <path>       Descriptor path. Defaults to the packaged location.
//   --help                Show this help text.
//
// The descriptor contains no secrets. It is provenance only: which tag, which
// commit, which platform, which channel, and which update provider produced
// the package. Local packaging never generates it.

import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStableReleaseTag } from './validate-release-version.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

// The descriptor ships inside build/desktop, which package.json already lists
// in build.files, so it lands in the asar without extra packaging rules.
export const DESCRIPTOR_RELATIVE_PATH = 'build/desktop/release-descriptor.json';

export const DESCRIPTOR_SCHEMA_VERSION = 1;

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const PLATFORM_ALIASES = {
  windows: 'windows',
  win32: 'windows',
  win: 'windows',
  macos: 'macos',
  darwin: 'macos',
  mac: 'macos',
  linux: 'linux',
};

function printHelp() {
  process.stdout.write(`Usage: node scripts/generate-desktop-release-descriptor.mjs [options]

Options:
  --tag <vX.Y.Z>        Release tag. Defaults to GITHUB_REF_NAME.
  --commit <sha>        Source commit. Defaults to GITHUB_SHA.
  --repository <o/r>    GitHub owner/repo. Defaults to GITHUB_REPOSITORY.
  --platform <windows|macos|linux>
                        Target platform. Defaults to the current platform.
  --output <path>       Descriptor path. Defaults to ${DESCRIPTOR_RELATIVE_PATH}.
  --help                Show this help text.

Writes the non-secret official release descriptor consumed by the desktop
update capability check. Local packaging must not run this script.
`);
}

// Explicit rather than derived from the flag name, because --runtime-commit
// does not slice into a valid camelCase key.
const VALUE_FLAGS = {
  '--tag': 'tag',
  '--commit': 'commit',
  '--repository': 'repository',
  '--platform': 'platform',
  '--runtime-commit': 'runtimeCommit',
  '--kind': 'kind',
  '--output': 'output',
};

export const RELEASE_KINDS = ['official', 'preview'];

export function resolveDescriptorPlatform(value) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PLATFORM_ALIASES[candidate] ?? null;
}

export function parseArgs(argv, env = process.env) {
  const options = {
    help: false,
    tag: (env.GITHUB_REF_NAME ?? '').trim(),
    commit: (env.GITHUB_SHA ?? '').trim(),
    repository: (env.GITHUB_REPOSITORY ?? '').trim(),
    platform: env.CATS_DESKTOP_RELEASE_PLATFORM ?? process.platform,
    runtimeCommit: (env.CATS_DESKTOP_RUNTIME_COMMIT ?? '').trim(),
    // Official unless the caller says otherwise, so a missing flag can never
    // silently downgrade a stable release into an unsigned preview.
    kind: (env.CATS_DESKTOP_RELEASE_KIND ?? 'official').trim(),
    output: DESCRIPTOR_RELATIVE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { ...options, help: true };
    }
    const key = VALUE_FLAGS[value];
    if (key !== undefined) {
      options[key] = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return options;
}

/**
 * Builds the descriptor and reports every invalid input at once. Returning
 * problems instead of throwing keeps the release workflow output readable when
 * more than one environment variable is missing.
 */
export function buildReleaseDescriptor({
  tag,
  commit,
  repository,
  platform,
  runtimeCommit,
  kind = 'official',
  generatedAt = null,
} = {}) {
  const problems = [];

  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  if (!RELEASE_KINDS.includes(normalizedKind)) {
    problems.push({
      code: 'descriptor_kind_invalid',
      message: `Release kind '${kind ?? ''}' is not official or preview.`,
    });
  }

  const parsedTag = parseStableReleaseTag(tag);
  if (!parsedTag.ok) {
    problems.push({ code: `descriptor_${parsedTag.code}`, message: parsedTag.message });
  }

  const normalizedCommit = typeof commit === 'string' ? commit.trim().toLowerCase() : '';
  if (!COMMIT_SHA.test(normalizedCommit)) {
    problems.push({
      code: 'descriptor_commit_invalid',
      message: `Source commit '${commit ?? ''}' is not a full 40-character sha.`,
    });
  }

  const normalizedRepository = typeof repository === 'string' ? repository.trim() : '';
  if (!GITHUB_REPOSITORY.test(normalizedRepository)) {
    problems.push({
      code: 'descriptor_repository_invalid',
      message: `Repository '${repository ?? ''}' is not in owner/name form.`,
    });
  }

  const normalizedPlatform = resolveDescriptorPlatform(platform);
  if (normalizedPlatform === null) {
    problems.push({
      code: 'descriptor_platform_invalid',
      message: `Platform '${platform ?? ''}' is not windows, macos, or linux.`,
    });
  }

  // The packaged runtime is a separate repository, so the platform commit
  // alone does not identify what shipped. Recording it makes a re-run of the
  // same Cats tag verifiable rather than merely hopeful.
  const normalizedRuntimeCommit = typeof runtimeCommit === 'string'
    ? runtimeCommit.trim().toLowerCase()
    : '';
  if (!COMMIT_SHA.test(normalizedRuntimeCommit)) {
    problems.push({
      code: 'descriptor_runtime_commit_invalid',
      message: `Runtime commit '${runtimeCommit ?? ''}' is not a full 40-character sha.`,
    });
  }

  if (problems.length > 0) {
    return { ok: false, descriptor: null, problems };
  }

  return {
    ok: true,
    problems: [],
    descriptor: {
      schemaVersion: DESCRIPTOR_SCHEMA_VERSION,
      kind: normalizedKind,
      tag: parsedTag.tag,
      version: parsedTag.version,
      commit: normalizedCommit,
      platform: normalizedPlatform,
      // SPEC-111 restricts Phase 1 publishing to the stable channel, so the
      // descriptor states it rather than accepting it as an input.
      channel: 'stable',
      provider: 'github_release',
      repository: normalizedRepository,
      runtimeCommit: normalizedRuntimeCommit,
      generatedAt,
    },
  };
}

export function serializeReleaseDescriptor(descriptor) {
  return `${JSON.stringify(descriptor, null, 2)}\n`;
}

export async function writeReleaseDescriptor(descriptor, outputPath, projectRoot = PROJECT_ROOT) {
  const absolutePath = resolve(projectRoot, outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, serializeReleaseDescriptor(descriptor), 'utf8');
  return absolutePath;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const result = buildReleaseDescriptor({
    tag: parsed.tag,
    commit: parsed.commit,
    repository: parsed.repository,
    platform: parsed.platform,
    runtimeCommit: parsed.runtimeCommit,
    kind: parsed.kind,
    generatedAt: new Date().toISOString(),
  });

  if (!result.ok) {
    for (const problem of result.problems) {
      process.stderr.write(`[release-descriptor] ${problem.code}: ${problem.message}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const writtenPath = await writeReleaseDescriptor(result.descriptor, parsed.output);
  process.stdout.write(
    `[release-descriptor] wrote ${result.descriptor.tag} `
      + `(${result.descriptor.platform}) to ${writtenPath}\n`,
  );
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
