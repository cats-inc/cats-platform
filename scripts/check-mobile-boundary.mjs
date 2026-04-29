#!/usr/bin/env node
/**
 * Boundary check for the cats-platform mobile-safe entry point.
 *
 * Two scans land in this script — see `MAIN_RULES` below for the
 * inverse rule formulation:
 *
 *   1. **Boundary surface** (`src/mobile/**`) — must not import any
 *      Node-only or desktop-only module. Scans direct imports only.
 *      Transitive compliance (an allowed re-export pulling node:*
 *      deeper down) is verified by running the mobile workspace's
 *      `npm run typecheck` against the boundary.
 *
 *   2. **Mobile consumer** (`mobile/app/**` and `mobile/src/**`) —
 *      must reach `cats-platform/src/**` only through the boundary
 *      (`src/mobile/**`). Anything else under `cats-platform/src/`
 *      is a violation. Per-platform Node prefixes are also blocked
 *      so a consumer cannot bypass the boundary by reaching into
 *      `node_modules` directly for poisoned modules.
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
const MOBILE_APP_DIR = path.resolve(PROJECT_ROOT, 'mobile/app');
const MOBILE_SRC_DIR = path.resolve(PROJECT_ROOT, 'mobile/src');
const PLATFORM_SRC_DIR = path.resolve(PROJECT_ROOT, 'src');

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
 * Project-internal paths that are known to leak Node deps. Each entry
 * is a substring that, if present anywhere in the resolved import
 * path (forward-slash normalised), fails the boundary scan.
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
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip generated directories that should never carry boundary
      // violations (e.g. .expo/types or build outputs).
      if (entry.name === 'node_modules' || entry.name === '.expo') {
        continue;
      }
      yield* walkTsFiles(full);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/** Forward-slash-normalised project-relative path. */
function projectRel(absolute) {
  return path.relative(PROJECT_ROOT, absolute).split(path.sep).join('/');
}

/**
 * Boundary scan: rejects forbidden Node + project-internal imports
 * directly inside `src/mobile/**`.
 */
function classifyBoundaryImport(importPath, sourceFile) {
  for (const prefix of FORBIDDEN_NODE_PREFIXES) {
    if (importPath.startsWith(prefix)) {
      return { ok: false, reason: `forbidden ${prefix}* import` };
    }
  }

  if (FORBIDDEN_NODE_BARE_NAMES.has(importPath)) {
    return {
      ok: false,
      reason: `forbidden bare Node import "${importPath}"`,
    };
  }

  if (importPath.startsWith('.')) {
    const resolved = path.resolve(path.dirname(sourceFile), importPath);
    const rel = projectRel(resolved);
    for (const fragment of FORBIDDEN_PROJECT_SUBSTRINGS) {
      if (rel.includes(fragment)) {
        return {
          ok: false,
          reason: `forbidden project path fragment "${fragment}" in "${rel}"`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Consumer scan: rejects mobile imports that reach into
 * `cats-platform/src/**` outside the boundary, or that hit a
 * forbidden Node module directly. Mobile may import:
 *
 *   - `cats-platform/src/mobile/**` (the boundary)
 *   - own files under `cats-platform/mobile/**`
 *   - npm packages
 */
function classifyConsumerImport(importPath, sourceFile) {
  for (const prefix of FORBIDDEN_NODE_PREFIXES) {
    if (importPath.startsWith(prefix)) {
      return { ok: false, reason: `forbidden ${prefix}* import` };
    }
  }

  if (FORBIDDEN_NODE_BARE_NAMES.has(importPath)) {
    return {
      ok: false,
      reason: `forbidden bare Node import "${importPath}"`,
    };
  }

  if (!importPath.startsWith('.')) {
    // npm package — outside our jurisdiction.
    return { ok: true };
  }

  const resolved = path.resolve(path.dirname(sourceFile), importPath);
  // If it resolves outside cats-platform/src/ entirely, it is either
  // own mobile code or some other consumer — fine.
  if (!resolved.startsWith(`${PLATFORM_SRC_DIR}${path.sep}`)) {
    return { ok: true };
  }
  // It does point into cats-platform/src/. Allow only if it lands
  // inside the boundary directory.
  if (
    resolved === BOUNDARY_DIR ||
    resolved.startsWith(`${BOUNDARY_DIR}${path.sep}`)
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `mobile must reach cats-platform/src only via src/mobile/**; got "${projectRel(resolved)}"`,
  };
}

async function scanFile(filePath, classify) {
  const content = await readFile(filePath, 'utf8');
  const violations = [];
  let match;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    const importPath = match[1];
    const verdict = classify(importPath, filePath);
    if (!verdict.ok) {
      violations.push({ importPath, reason: verdict.reason });
    }
  }
  let importsScanned = 0;
  IMPORT_REGEX.lastIndex = 0;
  while (IMPORT_REGEX.exec(content) !== null) {
    importsScanned += 1;
  }
  return { violations, importsScanned };
}

async function runScan(label, dir, classify) {
  let filesScanned = 0;
  let importsScanned = 0;
  let hasViolation = false;
  for await (const file of walkTsFiles(dir)) {
    filesScanned += 1;
    const { violations, importsScanned: count } = await scanFile(
      file,
      classify,
    );
    importsScanned += count;
    if (violations.length > 0) {
      hasViolation = true;
      console.error(`✗ ${projectRel(file)}`);
      for (const v of violations) {
        console.error(`    ${v.importPath} — ${v.reason}`);
      }
    }
  }
  return { label, filesScanned, importsScanned, hasViolation };
}

async function main() {
  const boundaryReport = await runScan(
    'src/mobile/ boundary',
    BOUNDARY_DIR,
    classifyBoundaryImport,
  );
  const consumerAppReport = await runScan(
    'mobile/app/ consumer',
    MOBILE_APP_DIR,
    classifyConsumerImport,
  );
  const consumerSrcReport = await runScan(
    'mobile/src/ consumer',
    MOBILE_SRC_DIR,
    classifyConsumerImport,
  );

  const reports = [boundaryReport, consumerAppReport, consumerSrcReport];
  const anyViolation = reports.some((r) => r.hasViolation);

  if (anyViolation) {
    console.error('\nMobile boundary breached.');
    process.exit(1);
  }

  for (const r of reports) {
    console.log(
      `✓ ${r.label} clean (${r.filesScanned} file(s), ${r.importsScanned} import(s) scanned).`,
    );
  }
}

main().catch((error) => {
  console.error('check-mobile-boundary.mjs failed:', error);
  process.exit(1);
});
