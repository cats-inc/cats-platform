// The feature pack directory stays Node-only and vendorable verbatim by Cats Bot
// (SPEC-145 FR-B9, Bot SPEC-016 FR-A2, PLAN-138 Phase 0). Bot runs these files
// through Node's type stripping, so a sibling `./x.js` value import would not
// resolve there, and non-erasable syntax would not load.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const featurePacksDirectory = fileURLToPath(
  new URL('../desktop/host/featurePacks/', import.meta.url),
);
const SIBLING_SPECIFIER = /^\.\/[^/]+$/u;

function stringLiteralText(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : '<computed>';
}

/** Every module a source file reaches, and whether only types cross. */
function collectModuleReferences(source) {
  const sourceFile = ts.createSourceFile(
    'module.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const references = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      references.push({
        specifier: stringLiteralText(node.moduleSpecifier),
        // `import { type X }` still loads the module once stripped; only a
        // clause-level `import type` is erased.
        typeOnly: Boolean(node.importClause?.isTypeOnly),
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      references.push({
        specifier: stringLiteralText(node.moduleSpecifier),
        typeOnly: node.isTypeOnly,
      });
    } else if (ts.isImportEqualsDeclaration(node)) {
      references.push({ specifier: node.moduleReference.getText(sourceFile), typeOnly: false });
    } else if (ts.isImportTypeNode(node)) {
      references.push({ specifier: stringLiteralText(node.argument.literal), typeOnly: true });
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        references.push({ specifier: stringLiteralText(node.arguments[0]), typeOnly: false });
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const specifier = `require(${stringLiteralText(node.arguments[0])})`;
        references.push({ specifier, typeOnly: false });
      }
    } else if (ts.isIdentifier(node) && node.text === 'createRequire') {
      references.push({ specifier: 'createRequire', typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

/**
 * Allowed: `node:` built-ins, and sibling files through `import type` or
 * `export type` only. Everything else, Electron and npm packages included,
 * is a violation.
 */
function findBoundaryViolations(source) {
  return collectModuleReferences(source)
    .filter(({ specifier, typeOnly }) => !(
      specifier.startsWith('node:') || (typeOnly && SIBLING_SPECIFIER.test(specifier))
    ))
    .map(({ specifier, typeOnly }) => `${specifier} (${typeOnly ? 'type' : 'value'})`);
}

async function listFeaturePackFiles() {
  const entries = await readdir(featurePacksDirectory, { withFileTypes: true });
  return entries.map((entry) => ({ name: entry.name, isFile: entry.isFile() }));
}

test('the boundary check accepts built-ins and sibling types only', () => {
  const allowed = [
    "import { createHash } from 'node:crypto';",
    "import { open, type FileHandle } from 'node:fs/promises';",
    "import type { FeaturePackLock } from './featurePackContract.js';",
    "export type { FeaturePackLock } from './featurePackContract.js';",
    "type Lock = import('./featurePackContract.js').FeaturePackLock;",
  ];
  for (const source of allowed) {
    assert.deepEqual(findBoundaryViolations(source), [], source);
  }

  const rejected = [
    "import { app } from 'electron';",
    "import type { BrowserWindow } from 'electron';",
    "import { unzipSync } from 'fflate';",
    "import { parseFeaturePackLock } from './featurePackContract.js';",
    "import { type FeaturePackLock } from './featurePackContract.js';",
    "import './featurePackContract.js';",
    "import type { DesktopHostConfig } from '../config.js';",
    "export { parseFeaturePackLock } from './featurePackContract.js';",
    "export * from './featurePackContract.js';",
    "const contract = await import('./featurePackContract.js');",
    "const fs = require('node:fs');",
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url);",
    "import fs = require('fs');",
  ];
  for (const source of rejected) {
    assert.notDeepEqual(findBoundaryViolations(source), [], source);
  }
});

test('feature pack files import only node built-ins and sibling types', async () => {
  const files = await listFeaturePackFiles();
  assert.ok(files.length > 0, 'desktop/host/featurePacks holds the pack contract');
  for (const file of files) {
    assert.ok(file.isFile && file.name.endsWith('.ts'), `${file.name} is a TypeScript file`);
    const source = await readFile(path.join(featurePacksDirectory, file.name), 'utf8');
    assert.deepEqual(findBoundaryViolations(source), [], file.name);
  }
});

test('feature pack files load unchanged under Node type stripping', async () => {
  const strippingFlags = process.features.typescript ? [] : ['--experimental-strip-types'];
  for (const file of await listFeaturePackFiles()) {
    const url = pathToFileURL(path.join(featurePacksDirectory, file.name)).href;
    const result = spawnSync(
      process.execPath,
      [...strippingFlags, '--input-type=module', '--eval', `await import(${JSON.stringify(url)});`],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${file.name} failed to load:\n${result.stderr}`);
  }
});
