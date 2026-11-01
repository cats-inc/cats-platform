#!/usr/bin/env node
//
// Script: validate-release-version.mjs
// Description: Guard that a desktop release tag matches the package version in
//              both package.json and package-lock.json before any platform
//              build work starts.
//
// Usage: node scripts/validate-release-version.mjs [--tag <vX.Y.Z>]
//
// Options:
//   --tag <vX.Y.Z>   Release tag to validate. Defaults to GITHUB_REF_NAME.
//   --json           Emit the machine-readable result instead of prose.
//   --help           Show this help text.
//
// Exit codes:
//   0  the tag is a stable release tag and every version source agrees
//   1  the tag is malformed, missing, or disagrees with a version source

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

// SPEC-111 section 7 restricts Phase 1 releases to stable vMAJOR.MINOR.PATCH
// tags. Prerelease channel publishing is deferred until promotion and
// downgrade rules exist, so a suffix is rejected rather than silently
// accepted as stable.
const STABLE_RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function printHelp() {
  process.stdout.write(`Usage: node scripts/validate-release-version.mjs [options]

Options:
  --tag <vX.Y.Z>   Release tag to validate. Defaults to GITHUB_REF_NAME.
  --json           Emit the machine-readable result instead of prose.
  --help           Show this help text.

Validates that a stable desktop release tag matches the version recorded in
package.json, the package-lock.json root version, and the package-lock.json
root package entry.
`);
}

export function parseArgs(argv, env = process.env) {
  let tag = typeof env.GITHUB_REF_NAME === 'string' ? env.GITHUB_REF_NAME.trim() : '';
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, tag, json };
    }
    if (value === '--tag') {
      tag = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    if (value === '--json') {
      json = true;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return { help: false, tag, json };
}

export function parseStableReleaseTag(tag) {
  const candidate = typeof tag === 'string' ? tag.trim() : '';

  if (candidate === '') {
    return {
      ok: false,
      code: 'tag_missing',
      message: 'No release tag was supplied. Pass --tag vX.Y.Z or set GITHUB_REF_NAME.',
    };
  }

  if (!STABLE_RELEASE_TAG.test(candidate)) {
    return {
      ok: false,
      code: 'tag_malformed',
      message: `Release tag '${candidate}' is not a stable vMAJOR.MINOR.PATCH tag.`,
    };
  }

  return { ok: true, tag: candidate, version: candidate.slice(1) };
}

/**
 * Compares the tag version against every version source a release change is
 * required to update. Returns one problem per disagreeing source so the
 * operator sees the complete picture instead of only the first mismatch.
 */
export function collectVersionProblems({ version, packageJson, packageLockJson }) {
  const problems = [];

  const packageVersion = packageJson?.version;
  if (typeof packageVersion !== 'string' || packageVersion.trim() === '') {
    problems.push({
      code: 'package_version_missing',
      message: 'package.json does not declare a version.',
    });
  } else if (packageVersion !== version) {
    problems.push({
      code: 'package_version_mismatch',
      message: `package.json version '${packageVersion}' does not equal tag version '${version}'.`,
    });
  }

  const lockVersion = packageLockJson?.version;
  if (typeof lockVersion !== 'string' || lockVersion.trim() === '') {
    problems.push({
      code: 'lock_version_missing',
      message: 'package-lock.json does not declare a root version.',
    });
  } else if (lockVersion !== version) {
    problems.push({
      code: 'lock_version_mismatch',
      message: `package-lock.json version '${lockVersion}' does not equal tag version '${version}'.`,
    });
  }

  // npm records the root package a second time under packages[""]. A hand
  // edited package.json leaves this entry stale, which would otherwise ship a
  // release whose lockfile still advertises the previous version.
  const lockRootVersion = packageLockJson?.packages?.['']?.version;
  if (typeof lockRootVersion !== 'string' || lockRootVersion.trim() === '') {
    problems.push({
      code: 'lock_root_version_missing',
      message: 'package-lock.json does not declare packages[""].version.',
    });
  } else if (lockRootVersion !== version) {
    problems.push({
      code: 'lock_root_version_mismatch',
      message: `package-lock.json packages[""].version '${lockRootVersion}' does not equal `
        + `tag version '${version}'.`,
    });
  }

  return problems;
}

export function validateReleaseVersion({ tag, packageJson, packageLockJson }) {
  const parsedTag = parseStableReleaseTag(tag);
  if (!parsedTag.ok) {
    return { ok: false, tag: null, version: null, problems: [parsedTag] };
  }

  const problems = collectVersionProblems({
    version: parsedTag.version,
    packageJson,
    packageLockJson,
  });

  return {
    ok: problems.length === 0,
    tag: parsedTag.tag,
    version: parsedTag.version,
    problems,
  };
}

async function readJsonFile(path) {
  const contents = await readFile(path, 'utf8');
  return JSON.parse(contents);
}

export async function readVersionSources(projectRoot = PROJECT_ROOT) {
  const [packageJson, packageLockJson] = await Promise.all([
    readJsonFile(resolve(projectRoot, 'package.json')),
    readJsonFile(resolve(projectRoot, 'package-lock.json')),
  ]);

  return { packageJson, packageLockJson };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const { packageJson, packageLockJson } = await readVersionSources();
  const result = validateReleaseVersion({
    tag: parsed.tag,
    packageJson,
    packageLockJson,
  });

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `[validate-release-version] ${result.tag} matches package version ${result.version}.\n`,
    );
  } else {
    for (const problem of result.problems) {
      process.stderr.write(`[validate-release-version] ${problem.code}: ${problem.message}\n`);
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
