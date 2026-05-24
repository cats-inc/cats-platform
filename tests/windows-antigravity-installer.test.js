import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const rootDir = process.cwd();

test('Windows Antigravity wrapper translates refresh flags to upstream installer flags', async () => {
  const script = await readFile(
    join(rootDir, 'scripts', 'windows', 'Install-Antigravity.ps1'),
    'utf8',
  );

  assert.match(script, /\[string\[\]\]\$ArgumentList = @\(\)/u);
  assert.match(
    script,
    /\$installerArguments = @\('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', \$tempScript\)/u,
  );
  assert.match(script, /\$installerArguments \+= \$ArgumentList/u);
  assert.match(script, /\$upstreamArgs = @\('-NonInteractive'\)/u);
  assert.match(script, /if \(\$Upgrade\) \{\s+\$upstreamArgs \+= '-Upgrade'\s+\}/u);
  assert.match(script, /if \(\$Force\) \{\s+\$upstreamArgs \+= '-Force'\s+\}/u);
  assert.match(script, /Invoke-AntigravityInstaller -ArgumentList \$upstreamArgs/u);
  assert.doesNotMatch(script, /Remove-Item -LiteralPath \(Resolve-AntigravityExecutablePath\)/u);
});
