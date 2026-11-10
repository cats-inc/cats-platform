#!/usr/bin/env node
//
// Script: validate-runtime-pin.mjs
// Description: Validate a Desktop release's frozen Runtime selection against
//              the main baseline recorded with its bump, before builds start.
//
// Usage: node scripts/validate-runtime-pin.mjs --tag <vX.Y.Z> --runtime-root <checkout> --commit <sha>
//
// Options:
//   --tag <vX.Y.Z>           Release tag whose notes section applies.
//   --runtime-root <path>    Runtime checkout with its full history and origin/main.
//   --commit <sha>           Full Runtime commit this release packages.
//   --notes <path>           Release notes file. Defaults to docs/release-notes.md.
//   --print-commit           Print the frozen source SHA without accessing Git.
//   --help                   Show this help text.
//
// Exit codes:
//   0  the commit is on Runtime main and the notes list whatever it leaves out
//   1  the commit is off main, or a change on main is left out without being listed

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableReleaseVersion } from './shared/release-primitives.mjs';
import { assertFrozenSource, frozenSourceSelection } from './shared/source-selection.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const USAGE = `Usage: node scripts/validate-runtime-pin.mjs --tag <vX.Y.Z> --runtime-root <checkout> --commit <sha> [--notes <path>]

Refuses a Runtime commit different from this version's frozen Source selection,
an unmerged baseline, or changes at that baseline not listed on a
"Left out of this release:" line as cats-runtime#N (or by the first 8 characters of
the commit's SHA). Commits changing only docs/ and .github/ do not count.
`;

export function parseArgs(argv) {
  const options = { help: false, tag: '', runtimeRoot: '', commit: '', notes: resolve(PROJECT_ROOT, 'docs', 'release-notes.md') }; // docs-boundary-ignore: manual publication reads notes; tests supply a temporary file.
  const names = { '--tag': 'tag', '--runtime-root': 'runtimeRoot', '--commit': 'commit', '--notes': 'notes' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') return { ...options, help: true };
    if (value === '--print-commit') { options.printCommit = true; continue; }
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
  const version = stableReleaseVersion(tag);
  const section = releaseNotesSection(await readFile(notes, 'utf8'), version);
  try {
    return await assertFrozenSource({ root: runtimeRoot, commit, notes: section, repository: 'cats-runtime' });
  } catch (error) {
    if (!section) error.message += `\nThe release notes have no section headed "Desktop ${version}".`;
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.printCommit) {
    const version = stableReleaseVersion(options.tag);
    const section = releaseNotesSection(await readFile(options.notes, 'utf8'), version);
    process.stdout.write(`${frozenSourceSelection(section, 'cats-runtime').commit}\n`);
    return;
  }
  if (!options.runtimeRoot || !options.commit) throw new Error('Pass --runtime-root and --commit.');
  const missing = await validateRuntimePin(options);
  process.stdout.write(missing.length === 0
    ? `Runtime ${options.commit} has every change at the frozen main baseline.\n`
    : `Runtime ${options.commit} leaves out ${missing.length} change(s) at the frozen baseline, all listed in the ${options.tag} notes.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
