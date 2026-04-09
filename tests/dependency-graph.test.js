import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED_SHARED_PRODUCT_IMPORTS = new Set([
  'shared/app-shell.ts',
  'shared/channelPaths.ts',
]);

async function* walkSourceFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const resolvedPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(resolvedPath);
      continue;
    }
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) {
      continue;
    }
    yield resolvedPath;
  }
}

function extractRelativeSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\w{},*$]+?\s+from\s+)?['"](\.[^'"]+)['"]/gu,
    /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

async function exists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeImport(sourceFile, specifier) {
  const absoluteBase = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [];

  if (path.extname(absoluteBase)) {
    candidates.push(absoluteBase);
    if (absoluteBase.endsWith('.js')) {
      candidates.push(absoluteBase.slice(0, -3) + '.ts');
      candidates.push(absoluteBase.slice(0, -3) + '.tsx');
    }
  } else {
    candidates.push(`${absoluteBase}.ts`);
    candidates.push(`${absoluteBase}.tsx`);
    candidates.push(path.join(absoluteBase, 'index.ts'));
    candidates.push(path.join(absoluteBase, 'index.tsx'));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(SOURCE_ROOT)) {
      continue;
    }
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function relativeSourcePath(filePath) {
  return path.relative(SOURCE_ROOT, filePath).replace(/\\/g, '/');
}

function productNameFor(relativePath) {
  const match = /^products\/([^/]+)\//u.exec(relativePath);
  return match?.[1] ?? null;
}

test('dependency graph keeps core, platform, and product ownership boundaries intact', async () => {
  const violations = [];

  for await (const sourceFile of walkSourceFiles(SOURCE_ROOT)) {
    const relativePath = relativeSourcePath(sourceFile);
    const source = await readFile(sourceFile, 'utf8');
    const specifiers = extractRelativeSpecifiers(source);

    for (const specifier of specifiers) {
      const resolvedImport = await resolveRelativeImport(sourceFile, specifier);
      if (!resolvedImport) {
        continue;
      }

      const importedRelativePath = relativeSourcePath(resolvedImport);

      if (relativePath.startsWith('core/') && /^products\//u.test(importedRelativePath)) {
        violations.push(`${relativePath} -> ${importedRelativePath}`);
        continue;
      }

      if (relativePath.startsWith('platform/') && /^products\//u.test(importedRelativePath)) {
        violations.push(`${relativePath} -> ${importedRelativePath}`);
        continue;
      }

      if (
        relativePath.startsWith('shared/')
        && /^products\//u.test(importedRelativePath)
        && !ALLOWED_SHARED_PRODUCT_IMPORTS.has(relativePath)
      ) {
        violations.push(`${relativePath} -> ${importedRelativePath}`);
        continue;
      }

      if (relativePath.startsWith('products/')) {
        const sourceProduct = productNameFor(relativePath);
        const targetProduct = productNameFor(importedRelativePath);
        if (
          sourceProduct === 'shared'
          && targetProduct
          && targetProduct !== 'shared'
        ) {
          violations.push(`${relativePath} -> ${importedRelativePath}`);
          continue;
        }

        if (
          sourceProduct
          && targetProduct
          && sourceProduct !== 'shared'
          && targetProduct !== 'shared'
          && sourceProduct !== targetProduct
        ) {
          violations.push(`${relativePath} -> ${importedRelativePath}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
