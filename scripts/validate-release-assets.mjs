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
import { verifySourceBundle, verifyBuildReceipts } from './desktop-source-bundle.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const SOURCE_ASSET = /^Cats-v\d+\.\d+\.\d+-(?:source\.zip(?:\.sha256)?|sources\.json)$/;
const BUILD_RECEIPT = /^cats-build-(?:windows|macos|linux)\.json$/;
const isSourceSupport = (name) => SOURCE_ASSET.test(name) || BUILD_RECEIPT.test(name);

/**
 * electron-updater publishes one metadata file per platform. Each names the
 * primary artifact the updater will download, so a missing metadata file means
 * that platform cannot self-update even if its installer uploaded fine.
 */
export const DESKTOP_RELEASE_MATRIX = [
  // Windows ships one NSIS installer per architecture. Both are listed in the
  // single latest.yml feed, and electron-updater picks the entry whose name
  // contains the running process.arch.
  { platform: 'windows', formats: ['nsis'], arches: ['x64', 'arm64'] },
  // macOS ships one universal binary rather than two per-architecture builds:
  // Apple Silicon runs natively instead of under Rosetta 2, and the updater
  // keeps a single latest-mac.yml feed that existing x64 installs also read.
  { platform: 'macos', formats: ['dmg', 'zip'], arches: ['universal'] },
  // Linux ships an amd64 and an arm64 .deb, each with its own feed.
  // electron-updater installs them with dpkg, which needs elevation -- unlike
  // the per-user Windows path.
  { platform: 'linux', formats: ['deb'], arches: ['x64', 'arm64'] },
];

const METADATA_BASENAMES = {
  windows: 'latest',
  macos: 'latest-mac',
  linux: 'latest-linux',
};

/**
 * Names the channel file that serves one platform architecture.
 *
 * electron-builder suffixes the name with the architecture only on Linux, and
 * only for something other than x64, so an arm64 Linux target writes
 * `latest-linux-arm64.yml` while both Windows architectures share `latest.yml`.
 * Hardcoding unsuffixed names meant a retarget reported the real file as an
 * unknown artifact *and* the expected file as missing -- two errors for one
 * naming rule.
 */
export function metadataFileFor(platform, arch) {
  const base = METADATA_BASENAMES[platform];
  return platform === 'linux' && arch !== 'x64' ? `${base}-${arch}.yml` : `${base}.yml`;
}

export function expectedMetadataFiles(matrix = DESKTOP_RELEASE_MATRIX) {
  return [...new Set(matrix.flatMap(
    (entry) => entry.arches.map((arch) => metadataFileFor(entry.platform, arch)),
  ))];
}

export const UPDATE_METADATA_FILES = expectedMetadataFiles();

// The format electron-updater downloads: the macOS ZIP, and the installer
// itself on Windows and Linux.
const UPDATER_FORMATS = { windows: 'nsis', macos: 'zip', linux: 'deb' };

function printHelp() {
  process.stdout.write(`Usage: node scripts/validate-release-assets.mjs [options]

Options:
  --root <dir>   Directory to scan recursively. Defaults to release/.
  --json         Emit the machine-readable result instead of prose.
  --source-tag <tag> --platform-commit <sha> --runtime-commit <sha>
                 Also require the complete source bundle and three OS receipts.
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
    if (['--source-tag', '--platform-commit', '--runtime-commit'].includes(value)) {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing ${value}`);
      options[value.slice(2)] = argv[++index];
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
const FORMAT_EXTENSIONS = {
  nsis: ['.exe'],
  dmg: ['.dmg'],
  // The updater archive is named from this repository's artifactName template,
  // which produces Cats-<version>-universal.zip rather than the -mac.zip
  // default some electron-builder setups emit. The name carries no platform
  // marker, so match it by extension and rely on the per-platform format list
  // above.
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

function archTokensIn(name) {
  const lowered = name.toLowerCase();
  return ALL_ARCH_TOKENS.filter(
    (token) => new RegExp(`(^|[-_.])${token}([-_.]|$)`, 'iu').test(lowered),
  );
}

function hasArchToken(name, arch) {
  return archTokensIn(name).some((token) => (ARCH_TOKENS[arch] ?? [arch]).includes(token));
}

function hasFormatExtension(name, format) {
  return (FORMAT_EXTENSIONS[format] ?? [])
    .some((extension) => name.toLowerCase().endsWith(extension.toLowerCase()));
}

/**
 * One required user-facing installer per released platform architecture. The
 * first declared format is the one users install.
 */
export const PRIMARY_ARTIFACTS = DESKTOP_RELEASE_MATRIX.flatMap((entry) => entry.arches.map(
  (arch) => ({ platform: entry.platform, arch, format: entry.formats[0] }),
));

function releasedExtensions(matrix = DESKTOP_RELEASE_MATRIX) {
  return matrix.flatMap((entry) => entry.formats.flatMap(
    (format) => FORMAT_EXTENSIONS[format] ?? [],
  ));
}

/**
 * Resolves which platform an artifact belongs to from its extension.
 *
 * Architecture has to be judged per platform, not across the whole matrix. With
 * Windows on x64 and Linux on arm64, a flattened token list accepts an x64 .deb
 * and an arm64 .exe -- each is released *somewhere*, just not where it was built.
 */
function platformForArtifact(name, matrix = DESKTOP_RELEASE_MATRIX) {
  const lowered = stripBlockmap(name).toLowerCase();
  for (const entry of matrix) {
    for (const format of entry.formats) {
      for (const extension of FORMAT_EXTENSIONS[format] ?? []) {
        if (lowered.endsWith(extension.toLowerCase())) {
          return entry;
        }
      }
    }
  }
  return null;
}

function archTokensFor(entry) {
  return entry.arches.flatMap((arch) => ARCH_TOKENS[arch] ?? [arch]);
}

function isUpdateMetadata(name) {
  return UPDATE_METADATA_FILES.includes(name);
}

function stripBlockmap(name) {
  return name.endsWith('.blockmap') ? name.slice(0, -'.blockmap'.length) : name;
}

export function resolveMissingPrimaryArtifacts(fileNames, primaryArtifacts = PRIMARY_ARTIFACTS) {
  return primaryArtifacts
    .filter(({ arch, format }) => !fileNames.some(
      (name) => hasFormatExtension(name, format) && hasArchToken(name, arch),
    ))
    .map(({ platform, arch }) => `${platform} ${arch}`);
}

/**
 * Checks that every released architecture can actually update.
 *
 * electron-updater takes the first file when none names process.arch, so a
 * Windows feed without its arm64 entry would quietly hand arm64 installs the
 * x64 installer, and a Linux feed naming the other architecture's .deb would
 * download a package dpkg refuses. Each feed must therefore offer an updater
 * file for every architecture it serves and nothing for any other.
 */
export function resolveFeedArchitectureProblems(metadataDocuments, matrix = DESKTOP_RELEASE_MATRIX) {
  const served = new Map();
  for (const entry of matrix) {
    for (const arch of entry.arches) {
      const name = metadataFileFor(entry.platform, arch);
      served.set(name, [...(served.get(name) ?? []), { platform: entry.platform, arch }]);
    }
  }

  const problems = [];
  for (const { name, document, error } of metadataDocuments) {
    const targets = served.get(name);
    if (!targets || error) {
      continue;
    }
    const referenced = collectReferencedFiles(document);
    if (referenced.length === 0) {
      // Already reported as update_metadata_empty.
      continue;
    }
    for (const { platform, arch } of targets) {
      const format = UPDATER_FORMATS[platform];
      if (!referenced.some((file) => hasFormatExtension(file, format) && hasArchToken(file, arch))) {
        problems.push({
          code: 'update_metadata_architecture_missing',
          message: `Update metadata ${name} offers no ${platform} ${arch} ${format} update.`,
        });
      }
    }
    for (const file of referenced) {
      if (archTokensIn(file).length > 0 && !targets.some(({ arch }) => hasArchToken(file, arch))) {
        problems.push({
          code: 'update_metadata_architecture_mismatch',
          message: `Update metadata ${name} references ${file}, built for an architecture it does not serve.`,
        });
      }
    }
  }
  return problems;
}

/**
 * Flags artifacts whose format is not part of the declared release set.
 * Update metadata and the blockmaps that accompany a released artifact are
 * always allowed.
 */
export function resolveDisallowedArtifacts(fileNames, matrix = DESKTOP_RELEASE_MATRIX) {
  const extensions = releasedExtensions(matrix);

  return fileNames.filter((name) => {
    if (isUpdateMetadata(name) || isSourceSupport(name)) {
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
  return fileNames.filter((name) => {
    if (isUpdateMetadata(name) || isSourceSupport(name)) {
      return false;
    }
    const entry = platformForArtifact(name, matrix);
    if (entry === null) {
      // Its format is not released at all; resolveDisallowedArtifacts owns that.
      return false;
    }
    const released = archTokensFor(entry).map((token) => token.toLowerCase());
    const present = archTokensIn(name);
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

  for (const target of resolveMissingPrimaryArtifacts(fileNames)) {
    problems.push({
      code: 'primary_artifact_missing',
      message: `No primary user-facing artifact was produced for ${target}.`,
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
      if (isSourceSupport(target)) {
        problems.push({ code: 'source_asset_used_as_update', message: `${name} must not reference source/support asset ${target}.` });
      }
      if (!present.has(target)) {
        problems.push({
          code: 'referenced_artifact_missing',
          message: `Update metadata ${name} references ${target}, which was not produced.`,
        });
      }
    }
  }

  problems.push(...resolveFeedArchitectureProblems(metadataDocuments));

  return { ok: problems.length === 0, problems, fileNames: [...present].sort() };
}

export async function validateSourceAssets(files, { tag, platformCommit, runtimeCommit }) {
  const named = (name) => {
    const matches = files.filter((file) => basename(file) === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${name}, found ${matches.length}`);
    return matches[0];
  };
  const expectedSources = [`Cats-${tag}-source.zip`, `Cats-${tag}-source.zip.sha256`, `Cats-${tag}-sources.json`];
  if (files.some((file) => SOURCE_ASSET.test(basename(file)) && !expectedSources.includes(basename(file)))) throw new Error('Source assets from another version');
  const manifest = verifySourceBundle({ tag, platformCommit, runtimeCommit,
    archive: await readFile(named(expectedSources[0])), checksum: await readFile(named(expectedSources[1]), 'utf8'),
    manifestBytes: await readFile(named(expectedSources[2])) });
  const receipts = await Promise.all(['windows', 'macos', 'linux'].map(async (platform) => {
    const receipt = JSON.parse(await readFile(named(`cats-build-${platform}.json`), 'utf8'));
    if (receipt.descriptor?.platform !== platform) throw new Error('Build receipt platform mismatch');
    return receipt;
  }));
  verifyBuildReceipts(manifest, receipts);
  return manifest;
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
  if (parsed['source-tag']) {
    try {
      await validateSourceAssets(files, { tag: parsed['source-tag'], platformCommit: parsed['platform-commit'], runtimeCommit: parsed['runtime-commit'] });
    } catch (error) {
      result.ok = false;
      result.problems.push({ code: 'source_bundle_invalid', message: error.message });
    }
  }

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
