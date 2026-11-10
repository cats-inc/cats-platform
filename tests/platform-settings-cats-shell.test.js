import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Cats Directory canvas does not render a nested shared settings shell', async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      'src',
      'products',
      'shared',
      'renderer',
      'components',
      'cats',
      'Cats.tsx',
    ),
    'utf8',
  );

  assert.doesNotMatch(source, /import \{ SettingsShell \} from '\.\.\/SettingsShell\.js';/u);
  assert.doesNotMatch(source, /<SettingsShell/u);
  assert.match(source, /<div className="catsLayout catsLayoutSidePanel">/u);
});
