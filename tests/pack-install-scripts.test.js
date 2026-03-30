import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('windows pack/install helper delimits the tarball variable in the delete prompt', async () => {
  const windowsScript = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Pack-Install.ps1'),
    'utf8',
  );

  assert.match(
    windowsScript,
    /Read-Host\s+"`nDelete\s+(?:\$\{tgzName\}|\$\(\$tgzName\))\?\s+\(Y\/n\)"/u,
  );
  assert.doesNotMatch(windowsScript, /Read-Host\s+"`nDelete\s+\$tgzName\?\s+\(Y\/n\)"/u);
});

test('pack/install helpers point users to cats as the CLI command', async () => {
  const windowsScript = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Pack-Install.ps1'),
    'utf8',
  );
  const linuxScript = await readFile(
    join(process.cwd(), 'scripts', 'linux', 'pack-install.sh'),
    'utf8',
  );
  const macosScript = await readFile(
    join(process.cwd(), 'scripts', 'macos', 'pack-install.sh'),
    'utf8',
  );

  for (const script of [windowsScript, linuxScript, macosScript]) {
    assert.match(script, /cats --help/u);
    assert.doesNotMatch(script, /cats-platform --help/u);
  }
});
