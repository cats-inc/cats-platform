#!/usr/bin/env node
/**
 * Boundary check for `src/mobile/**`. Per the 2026-04-29 integrator
 * review (review on `9531f0e8`), the mobile-safe entry point must not
 * import anything that drags Node-only / desktop-only code into the
 * mobile typecheck. This script walks every `.ts` file under
 * `src/mobile/` and fails if any direct import statement matches a
 * forbidden pattern.
 *
 * Direct-import scanning catches the common case (someone adds an
 * `import` line that pulls in `node:crypto` or a server module).
 * Transitive compliance — i.e. that an allowed re-export does not
 * itself have a forbidden import deeper in the chain — is checked by
 * running the mobile workspace's `npm run typecheck` after wiring
 * mobile to consume from this boundary.
 *
 * Run from `cats-platform/`:
 *
 *   node scripts/check-mobile-boundary.mjs
 *
 * Exits 0 if clean, 1 otherwise.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BOUNDARY_DIR = path.resolve(PROJECT_ROOT, 'src/mobile');

const FORBIDDEN_NODE_PREFIXES = ['node:'];

const FORBIDDEN_NODE_BARE_NAMES = new Set([
  'fs',
  'fs/promises',
  'path',
  'crypto',
  'os',
  'child_process',
  'http',
  'https',
  'net',
  'tls',
  'stream',
  'worker_threads',
  'cluster',
]);

/**
 * Project-internal paths that are known to leak Node deps. Add to this
 * list as new transitive offenders are discovered. Each entry is a
 * substring that, if present anywhere in the resolved import path,
 * fails the check.
 */
const FORBIDDEN_PROJECT_SUBSTRINGS = [
  '/server/',
  '/desktop/',
  '/runtime/',
  '/app/server/',
  '/shared/guideCatAssist',
  '/products/shared/api/workspaceContracts',
];

const IMPORT_REGEX =
  /^\s*(?:import|export)(?:\s+type)?\s+(?:[^"'`]+?\s+from\s+)?["']([^"'`]+)["']/gm;

async function* walkTsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

function classifyImport(importPath, sourceFile) {
  for (const prefix of FORBIDDEN_NODE_PREFIXES) {
    if (importPath.startsWith(prefix)) {
      return { ok: false, reason: `forbidden ${prefix}* import` };
    }
  }

  if (FORBIDDEN_NODE_BARE_NAMES.has(importPath)) {
    return { ok: false, reason: `forbidden bare Node import "${importPath}"` };
  }

  if (importPath.startsWith('.')) {
    const resolved = path.resolve(path.dirname(sourceFile), importPath);
    const projectRelative = path.relative(PROJECT_ROOT, resolved);
    for (const fragment of FORBIDDEN_PROJECT_SUBSTRINGS) {
      if (projectRelative.includes(fragment)) {
        return {
          ok: false,
          reason: `forbidden project path fragment "${fragment}" in "${projectRelative}"`,
        };
      }
    }
  }

  return { ok: true };
}

async function checkFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const violations = [];
  let match;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    const importPath = match[1];
    const verdict = classifyImport(importPath, filePath);
    if (!verdict.ok) {
      violations.push({ importPath, reason: verdict.reason });
    }
  }
  return violations;
}

async function main() {
  let hasViolation = false;
  let filesScanned = 0;
  let importsScanned = 0;

  for await (const file of walkTsFiles(BOUNDARY_DIR)) {
    filesScanned += 1;
    const content = await readFile(file, 'utf8');
    const importMatches = content.match(IMPORT_REGEX) ?? [];
    importsScanned += importMatches.length;

    const violations = await checkFile(file);
    if (violations.length > 0) {
      hasViolation = true;
      const projectRelative = path.relative(PROJECT_ROOT, file);
      console.error(`✗ ${projectRelative}`);
      for (const v of violations) {
        console.error(`    ${v.importPath} — ${v.reason}`);
      }
    }
  }

  if (hasViolation) {
    console.error(
      `\n${filesScanned} file(s) scanned, violations found. Mobile boundary breached.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ src/mobile/ boundary clean (${filesScanned} file(s), ${importsScanned} import(s) scanned).`,
  );
}

main().catch((error) => {
  console.error('check-mobile-boundary.mjs failed:', error);
  process.exit(1);
});
