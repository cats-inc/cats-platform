import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('index.html points Vite at the platform renderer entrypoint', async () => {
  const indexHtml = await readFile(path.join(process.cwd(), 'index.html'), 'utf8');

  assert.match(indexHtml, /src="\/src\/app\/renderer\/main\.tsx"/u);
  assert.doesNotMatch(indexHtml, /src="\/src\/renderer\/main\.tsx"/u);

  await access(path.join(process.cwd(), 'src', 'app', 'renderer', 'main.tsx'));
});
