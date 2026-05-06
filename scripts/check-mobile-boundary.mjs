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

/**
 * Browser+RN safe paths under `cats-platform/src/` that the mobile
 * consumer (`mobile/app/**`, `mobile/src/**`) is allowed to import
 * directly without going through `src/mobile/**`.
 *
 * Each entry is project-relative, forward-slash normalised, and
 * either a specific file (preferred) or a directory whose ENTIRE
 * tree has been audited. Specific-file allow-listing is the
 * default — directory-level allow-listing only when every current
 * AND future file under that root is guaranteed Node-clean
 * (e.g. an i18n catalog tree where the convention is "data only,
 * no imports").
 *
 * Why specific files: this checker scans direct imports only, not
 * transitive dependency graphs. An audited directory can grow a
 * `node:crypto`-tainted file later without the checker noticing,
 * and the next mobile consumer importing that file passes the
 * scan. Specific-file allow-list keeps the audit surface explicit
 * — adding a new file requires a deliberate allow-list change
 * paired with that file's audit.
 *
 * Audit checklist before adding an entry:
 *   1. Read every line of the file (or for directory entries,
 *      every line of every file under the tree).
 *   2. Confirm no `node:*` imports.
 *   3. Confirm no imports of `src/server/`, `src/desktop/`,
 *      `src/runtime/`, `src/app/server/`, `src/core/` (most files
 *      under there pull `node:crypto`), `src/shared/guideCatAssist*`,
 *      or `src/products/shared/api/workspaceContracts`.
 *   4. Confirm no React DOM / `window` / `document` references.
 *   5. Run `node scripts/check-mobile-boundary.mjs` followed by
 *      `cd mobile && npm run typecheck` to confirm transitive
 *      type cleanliness.
 *   6. Land the entry alongside the consumer change that needs it.
 *
 * (Cross-platform layering rationale documented in the proposal at
 * the top of `tests/mobile-i18n-web-parity.test.ts` and inline in
 * each shared module's header comment.)
 */
const ALLOWED_CONSUMER_PROJECT_DIRS = [
  // Mobile boundary — the existing path; everything else here is an
  // additional allow-list entry on top.
  'src/mobile',
  // Per-product browser+RN safe canonical algorithms.
  // Specific-file granularity because `src/products/chat/shared/`
  // also hosts files (e.g. `parallelChats.ts`,
  // `channelEntry.ts`, `operator-loop/index.ts`) that
  // transitively pull `src/core/*` — those are NOT mobile-safe.
  'src/products/chat/shared/directMessageSelectors.ts',
  // Cross-product browser+RN safe channel-recents filter. Lives
  // under `src/products/shared/` because it's used by every
  // product sidebar (chat / code / work) and by the mobile
  // boundary; specific-file scope because that directory also
  // hosts Node-tainted pieces (e.g. `api/workspaceContracts.ts`
  // — separately denied via FORBIDDEN_PROJECT_SUBSTRINGS).
  'src/products/shared/recentsFilter.ts',
  // Cross-product i18n catalogs + key registry. The catalogs are
  // pure object literals and `messageKeys.ts` is a pure const map.
  // Directory-level allow-list because the convention here is
  // "data only, no imports beyond the catalog interface" — any
  // future file under this root MUST keep that convention.
  'src/shared/i18n',
  // Browser+RN safe primitives shared across products. Specific
  // files because `src/shared/` also hosts Node-tainted pieces
  // (`guideCatAssist*.ts`, `catsAppSdk.ts`, etc.).
  'src/shared/platformSurfaces.ts',
  'src/shared/platform-contract.ts',
  'src/shared/roomRouting.ts',
  'src/shared/channelPaths.ts',
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
  // It does point into cats-platform/src/. Allow if it lands inside
  // any of the audited browser+RN safe directories.
  const rel = projectRel(resolved);
  for (const allowed of ALLOWED_CONSUMER_PROJECT_DIRS) {
    if (rel === allowed || rel.startsWith(`${allowed}/`)) {
      // Defence in depth: even an allowed directory must not have
      // a forbidden substring in the resolved path. Catches
      // accidental layering errors (e.g. someone placing a
      // /server/ subfolder under an allowed root).
      for (const fragment of FORBIDDEN_PROJECT_SUBSTRINGS) {
        if (rel.includes(fragment)) {
          return {
            ok: false,
            reason:
              `import "${importPath}" lands in allow-listed "${allowed}" `
              + `but the resolved path "${rel}" contains forbidden fragment "${fragment}"`,
          };
        }
      }
      return { ok: true };
    }
  }
  return {
    ok: false,
    reason:
      `mobile must reach cats-platform/src only via the boundary or an `
      + `allow-listed shared directory; got "${rel}". `
      + `If this directory is browser+RN safe, add it to ALLOWED_CONSUMER_PROJECT_DIRS `
      + `in scripts/check-mobile-boundary.mjs after auditing for node:* imports.`,
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
