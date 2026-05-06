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
 * path (forward-slash normalised), fails the boundary scan. These
 * are checked alongside the allow-list as defence in depth — even an
 * allow-listed directory is rejected if a forbidden substring sneaks
 * into a transitive subfolder (e.g. someone places a `/server/`
 * folder under an audited shared root).
 */
const FORBIDDEN_PROJECT_SUBSTRINGS = [
  '/server/',
  '/desktop/',
  '/runtime/',
  '/app/server/',
  '/core/',
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
  // Pure-data segmenter for chat message bodies. Splits a message
  // string into text / mention / link / attachment segments —
  // both the web `MessageBody.tsx` and the mobile RN
  // `MessageBody.tsx` consume this single segmenter so the
  // splitting logic can't drift across surfaces. Lives under
  // `/renderer/components/` because that's where the web
  // renderer's siblings live; the file itself has no React /
  // DOM deps and transitively only pulls
  // `src/core/mentionParsing.ts` (a regex-only module audited
  // separately — see comment immediately below).
  'src/products/shared/renderer/components/messageBodySegmenter.ts',
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
 * Strip the source-file extension from a project-relative path so
 * the allow-list can stay in canonical `.ts` / `.tsx` form while
 * accepting `.js` import specifiers (the NodeNext convention used
 * everywhere in this codebase). Without this, a mobile consumer
 * writing `import {…} from '../products/chat/shared/foo.js'`
 * would resolve to `…/foo.js`, which fails to match an allow-list
 * entry written as `…/foo.ts`.
 */
function stripSourceExtension(rel) {
  return rel.replace(/\.(ts|tsx|js|jsx)$/, '');
}

function isFileAllowListEntry(allowed) {
  return /\.(ts|tsx|js|jsx)$/.test(allowed);
}

/**
 * Returns true if `rel` (forward-slash, project-relative) is in
 * `ALLOWED_CONSUMER_PROJECT_DIRS`, comparing extensionless for
 * file entries and prefix-matching for directory entries.
 */
function matchesAllowedProjectPath(rel) {
  const relStripped = stripSourceExtension(rel);
  for (const allowed of ALLOWED_CONSUMER_PROJECT_DIRS) {
    if (isFileAllowListEntry(allowed)) {
      if (relStripped === stripSourceExtension(allowed)) {
        return true;
      }
    } else if (rel === allowed || rel.startsWith(`${allowed}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Unified import classifier shared by the boundary scan
 * (`src/mobile/**` files) and the consumer scan (`mobile/app/**`,
 * `mobile/src/**` files). Both surfaces apply the same allow-list
 * + forbidden-substring rules:
 *
 *   - Reject `node:*` and Node bare-name imports
 *   - Allow npm packages (no `.` prefix)
 *   - Allow paths that resolve outside `cats-platform/src/` (own
 *     workspace code, build siblings, etc.)
 *   - For paths that resolve INSIDE `cats-platform/src/`:
 *     - Reject if any FORBIDDEN_PROJECT_SUBSTRINGS appears in the
 *       resolved path (defence in depth — catches forbidden
 *       subfolders even under allow-listed roots)
 *     - Reject unless the resolved path matches
 *       ALLOWED_CONSUMER_PROJECT_DIRS (specific file or directory
 *       prefix)
 *
 * Earlier the boundary scan only checked forbidden substrings, not
 * the allow-list. That meant a `src/mobile/` file could import any
 * `../products/chat/shared/*.ts` whose path didn't happen to
 * include `/server/` etc., bypassing the specific-file allow-list
 * the consumer scan applied. Reviewer flagged this as the very
 * loophole the allow-list was supposed to close. Both scans now
 * share `classifyImport`.
 */
function classifyImport(importPath, sourceFile) {
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
  // Resolves outside cats-platform/src/ — own workspace code,
  // build siblings, etc. Not subject to the allow-list.
  if (!resolved.startsWith(`${PLATFORM_SRC_DIR}${path.sep}`)) {
    return { ok: true };
  }

  const rel = projectRel(resolved);

  // Defence in depth: forbidden substrings always reject, even
  // inside an otherwise allow-listed root.
  for (const fragment of FORBIDDEN_PROJECT_SUBSTRINGS) {
    if (rel.includes(fragment)) {
      return {
        ok: false,
        reason: `forbidden project path fragment "${fragment}" in "${rel}"`,
      };
    }
  }

  if (matchesAllowedProjectPath(rel)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      `import target "${rel}" is not in the mobile-safe allow-list `
      + `(ALLOWED_CONSUMER_PROJECT_DIRS in scripts/check-mobile-boundary.mjs). `
      + `If the file is browser+RN safe, audit per the doc string and add a `
      + `specific-file entry alongside the change that needs it.`,
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
  // All three scans share the same `classifyImport` — boundary
  // and consumer rules are now identical. Earlier they diverged
  // (boundary skipped the allow-list check), which let
  // `src/mobile/**` reach into any non-forbidden `src/` path.
  const boundaryReport = await runScan(
    'src/mobile/ boundary',
    BOUNDARY_DIR,
    classifyImport,
  );
  const consumerAppReport = await runScan(
    'mobile/app/ consumer',
    MOBILE_APP_DIR,
    classifyImport,
  );
  const consumerSrcReport = await runScan(
    'mobile/src/ consumer',
    MOBILE_SRC_DIR,
    classifyImport,
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
