#!/usr/bin/env node
//
// Script: validate-runtime-pin.mjs
// Description: Guard that a Desktop release's Runtime commit is on Runtime main
//              and that this version's release notes name every shipped change
//              it leaves out, before any platform build work starts.
//
// Usage: node scripts/validate-runtime-pin.mjs --tag <vX.Y.Z> --runtime-root <checkout> --commit <sha>
//
// Options:
//   --tag <vX.Y.Z>           Release tag whose notes section applies.
//   --runtime-root <path>    Runtime checkout with its full history and origin/main.
//   --commit <sha>           Full Runtime commit this release packages.
//   --notes <path>           Release notes file. Defaults to docs/release-notes.md.
//   --help                   Show this help text.
//
// Exit codes:
//   0  the commit is on Runtime main and the notes name whatever it leaves out
//   1  the commit is off main, or a shipped change on main is left out unnamed

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSelectedSource, stableReleaseVersion } from './shared/release-primitives.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const USAGE = `Usage: node scripts/validate-runtime-pin.mjs --tag <vX.Y.Z> --runtime-root <checkout> --commit <sha> [--notes <path>]

Refuses a Runtime commit that is not on Runtime main, or that lacks shipped changes
on main which this version's section of the release notes does not name as
cats-runtime#N (or by the first 8 characters of the commit's SHA).
`;

export function parseArgs(argv) {
  const options = { help: false, tag: '', runtimeRoot: '', commit: '', notes: resolve(PROJECT_ROOT, 'docs', 'release-notes.md') }; // docs-boundary-ignore: manual publication reads notes; tests supply a temporary file.
  const names = { '--tag': 'tag', '--runtime-root': 'runtimeRoot', '--commit': 'commit', '--notes': 'notes' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') return { ...options, help: true };
    if (!names[value]) throw new Error(`Unknown option: ${value}`);
    options[names[value]] = argv[index + 1] ?? '';
    index += 1;
  }
  return options;
}

/** The notes for one Desktop version only, so a mention under another release does not count. */
export function releaseNotesSection(markdown, version) {
  const heading = new RegExp(`^## .*\\bDesktop ${version.replaceAll('.', '\\.')}(?![\\d.])`, 'u');
  return markdown.split(/^(?=## )/mu).find(section => heading.test(section)) ?? '';
}

export async function validateRuntimePin({ tag, runtimeRoot, commit, notes }) {
  const section = releaseNotesSection(await readFile(notes, 'utf8'), stableReleaseVersion(tag));
  return assertSelectedSource({ root: runtimeRoot, commit, notes: section, repository: 'cats-runtime' });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!options.runtimeRoot || !options.commit) throw new Error('Pass --runtime-root and --commit.');
  const missing = await validateRuntimePin(options);
  process.stdout.write(missing.length === 0
    ? `Runtime ${options.commit} has every shipped change on main.\n`
    : `Runtime ${options.commit} leaves out ${missing.length} shipped change(s) on main, all named in the ${options.tag} notes.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
