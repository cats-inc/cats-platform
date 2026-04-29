import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { exportCatsCodeUserAppPackage } from '../src/products/code/state/appExport.ts';
import { CATS_CODE_APP_EXPORT_METADATA_FILE } from '../src/products/code/shared/appExport.ts';
import { parseCatsAppManifestV1 } from '../src/shared/catsAppValidation.ts';

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'cats-code-app-export-'));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

test('exportCatsCodeUserAppPackage copies the template, writes manifest metadata, and builds renderer', async () => {
  const tempDir = await createTempDir();
  const packagePath = path.join(tempDir, 'user.timer.cats-app');
  const templatePath = path.join(process.cwd(), 'src/products/code/templates/user-app');

  const result = await exportCatsCodeUserAppPackage({
    packagePath,
    templatePath,
    appId: 'user.timer',
    displayName: 'Timer',
    description: 'Timer exported from Cats Code.',
    lobbyIcon: 'timer',
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
    validationOptions: {
      productRoutePrefixes: ['/chat', '/work', '/code'],
    },
  });

  const manifest = await readJsonFile<{ id: string; entrypoints: { renderer: string } }>(
    path.join(packagePath, 'cats.app.json'),
  );
  const metadata = await readJsonFile<{ appId: string; artifacts: Array<{ path: string }> }>(
    path.join(packagePath, CATS_CODE_APP_EXPORT_METADATA_FILE),
  );
  const parsed = parseCatsAppManifestV1(manifest, {
    productRoutePrefixes: ['/chat', '/work', '/code'],
  });
  const buildCommand = result.build?.command ?? '';

  assert.equal(parsed.ok, true);
  assert.equal(result.packagePath, packagePath);
  assert.equal(buildCommand.endsWith('npm') || buildCommand.endsWith('npm.cmd'), true);
  assert.equal(manifest.id, 'user.timer');
  assert.equal(manifest.entrypoints.renderer, 'dist/renderer/index.html');
  assert.equal(metadata.appId, 'user.timer');
  assert.deepEqual(metadata.artifacts.map((artifact) => artifact.path), [
    'cats.app.json',
    'dist/renderer/index.html',
  ]);
  await stat(path.join(packagePath, 'src/renderer/index.html'));
  await stat(path.join(packagePath, 'dist/renderer/index.html'));
});

test('exportCatsCodeUserAppPackage refuses to overwrite an existing export target by default', async () => {
  const tempDir = await createTempDir();
  const packagePath = path.join(tempDir, 'user.existing.cats-app');
  const templatePath = path.join(process.cwd(), 'src/products/code/templates/user-app');
  await writeFile(packagePath, 'already here', 'utf8');

  await assert.rejects(
    exportCatsCodeUserAppPackage({
      packagePath,
      templatePath,
      appId: 'user.existing',
      displayName: 'Existing',
      runBuild: false,
    }),
    /export target already exists/u,
  );
});
