import assert from 'node:assert/strict';
import test from 'node:test';

import { build } from 'esbuild';

test('renderer bundle excludes server-only replay persistence and core model modules', async () => {
  const result = await build({
    entryPoints: ['src/app/renderer/main.tsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: '.tmp-renderer-boundary',
    write: false,
    metafile: true,
    logLevel: 'silent',
    loader: {
      '.css': 'css',
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.gif': 'dataurl',
      '.webp': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.ttf': 'dataurl',
    },
  });

  const inputs = Object.keys(result.metafile.inputs);

  assert.equal(
    inputs.some((entry) => entry === 'src/platform/orchestration/replayActivity.ts'),
    false,
  );
  assert.equal(
    inputs.some((entry) => entry === 'src/core/model/index.ts'),
    false,
  );
});
