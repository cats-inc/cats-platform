import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('Check-CLITools keeps the repo-owned host, WSL, and Docker check surface aligned', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Check-CLITools.ps1'),
    'utf8',
  );

  assert.match(script, /Install-ClaudeCode\.ps1/u);
  assert.match(script, /Install-CursorAgent\.ps1/u);
  assert.match(script, /Install-Goose\.ps1/u);
  assert.match(script, /Install-Junie\.ps1/u);
  assert.match(script, /Install-NodeCliPack\.ps1/u);
  assert.match(script, /Install-WSLCLITools\.ps1/u);
  assert.match(script, /Install-DockerCLITools\.ps1/u);
  assert.match(script, /-CheckOnly/u);
});
