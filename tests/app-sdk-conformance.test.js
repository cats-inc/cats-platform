import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { APP_SDK_VERSION, PLATFORM_VERSION } from '#cats-app-package';
import { encodeAppPackage, validateRendererAppPackage } from '@cats-inc/cats-platform/app-sdk';
import { buildMinimalApp } from '../examples/app-sdk-minimal-app/build.mjs';

const vectors = JSON.parse(await readFile(new URL('./fixtures/app-sdk-conformance-v1.json', import.meta.url), 'utf8'));

function patch(base, changes = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete result[key];
    else result[key] = value;
  }
  return result;
}

function files(entries = [{ path: 'renderer/index.html', text: '<html><head></head><body>Conformance</body></html>' }]) {
  return entries.flatMap((entry) => {
    const make = (filePath) => ({ path: filePath, data: entry.size === undefined ? Buffer.from(entry.text) : Buffer.alloc(entry.size) });
    return entry.repeat === undefined ? [make(entry.path)]
      : Array.from({ length: entry.repeat }, (_, index) => make(entry.path.replace('{n}', String(index))));
  });
}

for (const vector of vectors.cases) {
  test(`conformance: ${vector.name}`, () => {
    const host = { ...vectors.host, ...vector.host };
    const run = () => validateRendererAppPackage(
      encodeAppPackage({ manifest: patch(vectors.base, vector.manifest), files: files(vector.files) }), host);
    if (vector.expect === 'accept') {
      assert.equal(run().manifest.id, patch(vectors.base, vector.manifest).id);
      return;
    }
    const pattern = new RegExp(vector.expect, 'iu');
    if (vector.stage === 'encode') {
      assert.throws(() => encodeAppPackage({ manifest: patch(vectors.base, vector.manifest), files: files(vector.files) }), pattern);
    } else {
      assert.doesNotThrow(() => encodeAppPackage({ manifest: patch(vectors.base, vector.manifest), files: files(vector.files) }));
      assert.throws(run, pattern);
    }
  });
}

test('the conformance host pins the SDK version this Platform ships', () => {
  // Raise the vectors' host (and review the cases) when the SDK interface changes.
  assert.equal(vectors.host.appSdkVersion, APP_SDK_VERSION);
});

test('the minimal example builds a deterministic archive the current host accepts', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-app-sdk-example-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await buildMinimalApp({ outDir: path.join(root, 'first') });
  const second = await buildMinimalApp({ outDir: path.join(root, 'second') });
  assert.equal(first.sha256, second.sha256);
  const bytes = await readFile(first.artifactPath);
  // Fails on the next breaking minor until the example's declared range is updated with it.
  assert.equal(validateRendererAppPackage(bytes, { platformVersion: PLATFORM_VERSION }).manifest.id, 'example.minimal');
});
