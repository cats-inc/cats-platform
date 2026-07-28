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

export function resolveMissingPrimaryArtifacts(fileNames) {
  return PRIMARY_ARTIFACT_PATTERNS
    .filter(({ pattern }) => !fileNames.some((name) => pattern.test(name)))
    .map(({ platform }) => platform);
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
