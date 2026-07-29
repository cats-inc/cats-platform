#!/usr/bin/env node
//
// Script: validate-release-assets.mjs
// Description: Verify that every file referenced by the generated update
//              metadata was actually produced, and that each platform's
//              primary user-facing artifact is present, before a draft
//              GitHub Release is published.
//
// Usage: node scripts/validate-release-assets.mjs --root <dir>
//
// Options:
//   --root <dir>   Directory to scan recursively. Defaults to release/.
//   --json         Emit the machine-readable result instead of prose.
//   --help         Show this help text.
//
// Exit codes:
//   0  every required artifact and every referenced file exists
//   1  metadata is missing, unreadable, or references a file that was not built

import process from 'node:process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

/**
 * electron-updater publishes one metadata file per platform. Each names the
 * primary artifact the updater will download, so a missing metadata file means
 * that platform cannot self-update even if its installer uploaded fine.
 */
export const UPDATE_METADATA_FILES = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml'];

export const PRIMARY_ARTIFACT_PATTERNS = [
  { platform: 'windows', pattern: /\.exe$/iu },
  { platform: 'macos', pattern: /\.dmg$/iu },
  { platform: 'linux', pattern: /\.AppImage$/iu },
];

function printHelp() {
  process.stdout.write(`Usage: node scripts/validate-release-assets.mjs [options]

Options:
  --root <dir>   Directory to scan recursively. Defaults to release/.
  --json         Emit the machine-readable result instead of prose.
  --help         Show this help text.

Fails when generated update metadata references a file that is not present, or
when a platform's primary user-facing artifact is missing.
`);
}

export function parseArgs(argv) {
  const options = { help: false, root: 'release', json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { ...options, help: true };
    }
    if (value === '--root') {
      options.root = (argv[index + 1] ?? '').trim() || 'release';
      index += 1;
      continue;
    }
    if (value === '--json') {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return options;
}

/**
 * Collects the file names referenced by one metadata document. Both the
 * top-level `path` and each `files[].url` are checked, because electron-updater
 * reads whichever the client version supports.
 */
export function collectReferencedFiles(document) {
  if (typeof document !== 'object' || document === null) {
    return [];
  }

  const referenced = new Set();
  const record = document;

  if (typeof record.path === 'string' && record.path.trim() !== '') {
    referenced.add(basename(decodeURIComponent(record.path.trim())));
  }

  if (Array.isArray(record.files)) {
    for (const entry of record.files) {
      if (typeof entry?.url === 'string' && entry.url.trim() !== '') {
        referenced.add(basename(decodeURIComponent(entry.url.trim())));
      }
    }
  }

  return [...referenced];
}

/**
 * The declared release set.
 *
 * This is the single source of truth for what an official release may contain.
 * It is not a statement that other formats or architectures are undesirable —
 * it is a statement of what this release publishes, so `--publish always`
 * cannot quietly upload something the release page never promised.
 *
 * Widening the release set is one edit here plus the matching workflow matrix
 * entry. A drift test keeps the two aligned, so adding, say, a Linux arm64
 * AppImage is a deliberate two-line change rather than something the validator
 * refuses on principle.
 */
export const DESKTOP_RELEASE_MATRIX = [
  { platform: 'windows', formats: ['nsis'], arches: ['x64'] },
  { platform: 'macos', formats: ['dmg', 'zip'], arches: ['universal'] },
  { platform: 'linux', formats: ['AppImage'], arches: ['x64'] },
];

const FORMAT_EXTENSIONS = {
  nsis: ['.exe'],
  dmg: ['.dmg'],
  // The updater archive is named from this repository's artifactName template,
  // which produces Cats-<version>-universal.zip rather than the -mac.zip
  // default some electron-builder setups emit.
  zip: ['.zip'],
  AppImage: ['.AppImage'],
  deb: ['.deb'],
  'tar.gz': ['.tar.gz'],
  pkg: ['.pkg'],
};

// electron-builder spells the same architecture differently per target.
const ARCH_TOKENS = {
  x64: ['x64', 'x86_64', 'amd64'],
  arm64: ['arm64', 'aarch64'],
  ia32: ['ia32', 'i386'],
  armv7l: ['armv7l'],
  universal: ['universal'],
};

const ALL_ARCH_TOKENS = Object.values(ARCH_TOKENS).flat();

function releasedExtensions(matrix = DESKTOP_RELEASE_MATRIX) {
  return matrix.flatMap((entry) => entry.formats.flatMap(
    (format) => FORMAT_EXTENSIONS[format] ?? [],
  ));
}

function releasedArchTokens(matrix = DESKTOP_RELEASE_MATRIX) {
  return matrix.flatMap((entry) => entry.arches.flatMap((arch) => ARCH_TOKENS[arch] ?? [arch]));
}

function isUpdateMetadata(name) {
  return UPDATE_METADATA_FILES.includes(name);
}

function stripBlockmap(name) {
  return name.endsWith('.blockmap') ? name.slice(0, -'.blockmap'.length) : name;
}

export function resolveMissingPrimaryArtifacts(fileNames) {
  return PRIMARY_ARTIFACT_PATTERNS
    .filter(({ pattern }) => !fileNames.some((name) => pattern.test(name)))
    .map(({ platform }) => platform);
}

/**
 * Flags artifacts whose format is not part of the declared release set.
 * Update metadata and the blockmaps that accompany a released artifact are
 * always allowed.
 */
export function resolveDisallowedArtifacts(fileNames, matrix = DESKTOP_RELEASE_MATRIX) {
  const extensions = releasedExtensions(matrix);

  return fileNames.filter((name) => {
    if (isUpdateMetadata(name)) {
      return false;
    }
    const base = stripBlockmap(name);
    return !extensions.some((extension) => base.toLowerCase().endsWith(extension.toLowerCase()));
  });
}

/**
 * Flags artifacts built for an architecture the declared release set does not
 * include. An artifact whose name carries no recognizable architecture token is
 * left alone rather than guessed at.
 */
export function resolveUnreleasedArchitectureArtifacts(
  fileNames,
  matrix = DESKTOP_RELEASE_MATRIX,
) {
  const released = releasedArchTokens(matrix).map((token) => token.toLowerCase());

  return fileNames.filter((name) => {
    if (isUpdateMetadata(name)) {
      return false;
    }
    const lowered = name.toLowerCase();
    const present = ALL_ARCH_TOKENS.filter(
      (token) => new RegExp(`(^|[-_.])${token}([-_.]|$)`, 'iu').test(lowered),
    );
    if (present.length === 0) {
      return false;
    }
    return !present.some((token) => released.includes(token.toLowerCase()));
  });
}

export function resolveMissingMetadataFiles(fileNames) {
  const present = new Set(fileNames);
  return UPDATE_METADATA_FILES.filter((name) => !present.has(name));
}

async function listFilesRecursively(root) {
  const found = [];

  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      found.push(entryPath);
    }
  }

  const rootStat = await stat(root).catch(() => null);
  if (rootStat === null) {
    return [];
  }
  await walk(root);
  return found;
}

export function validateReleaseAssets({ files, metadataDocuments }) {
  const problems = [];
  const fileNames = files.map((path) => basename(path));

  for (const platform of resolveMissingPrimaryArtifacts(fileNames)) {
    problems.push({
      code: 'primary_artifact_missing',
      message: `No primary user-facing artifact was produced for ${platform}.`,
    });
  }

  for (const name of resolveMissingMetadataFiles(fileNames)) {
    problems.push({
      code: 'update_metadata_missing',
      message: `Update metadata ${name} was not produced.`,
    });
  }

  for (const name of resolveDisallowedArtifacts(fileNames)) {
    problems.push({
      code: 'artifact_outside_release_contract',
      message: `${name} is not one of the declared release artifacts. `
        + 'Add its format to DESKTOP_RELEASE_MATRIX if it should ship.',
    });
  }

  for (const name of resolveUnreleasedArchitectureArtifacts(fileNames)) {
    problems.push({
      code: 'artifact_architecture_not_released',
      message: `${name} targets an architecture the declared release set does not include. `
        + 'Add it to DESKTOP_RELEASE_MATRIX if it should ship.',
    });
  }

  const present = new Set(fileNames);
  for (const { name, document, error } of metadataDocuments) {
    if (error) {
      problems.push({
        code: 'update_metadata_unreadable',
        message: `Update metadata ${name} could not be parsed: ${error}`,
      });
      continue;
    }

    const referenced = collectReferencedFiles(document);
    if (referenced.length === 0) {
      problems.push({
        code: 'update_metadata_empty',
        message: `Update metadata ${name} references no artifact.`,
      });
      continue;
    }

    for (const target of referenced) {
      if (!present.has(target)) {
        problems.push({
          code: 'referenced_artifact_missing',
          message: `Update metadata ${name} references ${target}, which was not produced.`,
        });
      }
    }
  }

  return { ok: problems.length === 0, problems, fileNames: [...present].sort() };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const root = resolve(PROJECT_ROOT, parsed.root);
  const files = await listFilesRecursively(root);

  const metadataDocuments = [];
  for (const path of files) {
    if (!UPDATE_METADATA_FILES.includes(basename(path))) {
      continue;
    }
    try {
      metadataDocuments.push({
        name: basename(path),
        document: yaml.load(await readFile(path, 'utf8')),
        error: null,
      });
    } catch (error) {
      metadataDocuments.push({
        name: basename(path),
        document: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = validateReleaseAssets({ files, metadataDocuments });

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `[validate-release-assets] ${result.fileNames.length} files verified in ${root}.\n`,
    );
  } else {
    for (const problem of result.problems) {
      process.stderr.write(`[validate-release-assets] ${problem.code}: ${problem.message}\n`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
