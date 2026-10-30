import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const scriptsRoot = join(process.cwd(), 'scripts', 'windows');
const quote = (path) => `'${path.replaceAll("'", "''")}'`;
const hiddenProcess = quote(join(scriptsRoot, '_HiddenProcess.ps1'));
const nativeSupport = quote(join(scriptsRoot, '_NativeInstallerSupport.ps1'));

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows PowerShell 5.1 only' };
  }
  return {};
}

async function powershell(command) {
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);
  return stdout.trim();
}

const protocolsAfterSourcing = (before) => powershell([
  `[Net.ServicePointManager]::SecurityProtocol = '${before}'`,
  `. ${hiddenProcess}`,
  '[Net.ServicePointManager]::SecurityProtocol.ToString()',
].join('; '));

test('sourcing the hidden-process helper adds TLS 1.2 to a legacy default only', skipUnlessWindows(), async () => {
  // An early Windows 10 starts Windows PowerShell 5.1 at TLS 1.0, which download hosts refuse.
  assert.equal(await protocolsAfterSourcing('Tls'), 'Tls, Tls12');
  assert.equal(await protocolsAfterSourcing('Tls, Tls11'), 'Tls, Tls11, Tls12');
  // The OS's own choice (TLS 1.2 or 1.3 on Windows 11) and an explicit TLS 1.2 stay as they are.
  assert.equal(await protocolsAfterSourcing('SystemDefault'), 'SystemDefault');
  assert.equal(await protocolsAfterSourcing('Tls12'), 'Tls12');
});

test('a vendor script gets the TLS 1.2 line after its param block, and the line works on its own', skipUnlessWindows(), async () => {
  const placed = await powershell([
    `. ${hiddenProcess}`,
    `. ${nativeSupport}`,
    "$vendor = 'param([string]$Version = ''latest'')' + [Environment]::NewLine + 'Write-Output $Version'",
    '$script = Add-CatsScriptPrologue -ScriptText $vendor -Prologue $CatsTls12Prologue',
    '$errors = $null',
    '$ast = [System.Management.Automation.Language.Parser]::ParseInput($script, [ref]$null, [ref]$errors)',
    "'{0}|{1}|{2}' -f $errors.Count, [bool]$ast.ParamBlock, ($script.IndexOf('Enable-CatsTls12') -gt $script.IndexOf('param('))",
  ].join('; '));
  assert.equal(placed, '0|True|True');
  // The child process runs only the prologue's text, so it must stand alone.
  const child = await powershell([
    `. ${hiddenProcess}`,
    "[Net.ServicePointManager]::SecurityProtocol = 'Tls'",
    'Remove-Item Function:\\Enable-CatsTls12',
    '. ([scriptblock]::Create($CatsTls12Prologue))',
    '[Net.ServicePointManager]::SecurityProtocol.ToString()',
  ].join('; '));
  assert.equal(child, 'Tls, Tls12');
});

test('every helper that downloads turns TLS 1.2 on, in its own process and in a vendor child', async () => {
  const read = (name) => readFile(join(scriptsRoot, name), 'utf8');
  assert.match(
    await read('_NativeInstallerSupport.ps1'),
    /Add-CatsScriptPrologue -ScriptText \$ScriptText -Prologue "\$CatsTls12Prologue`n\$prologue"/u,
  );
  for (const name of ['Install-Grok.ps1', 'Install-MetaCli.ps1']) {
    assert.match(await read(name), /\$bootstrap = \$CatsTls12Prologue \+ \[Environment\]::NewLine \+ @'/u, name);
  }
  for (const name of ['Install-Antigravity.ps1', 'Install-Goose.ps1']) {
    assert.match(
      await read(name),
      /Add-CatsScriptPrologue -ScriptText \(\[string\]\$installScript\) -Prologue \$CatsTls12Prologue/u,
      name,
    );
  }
  for (const name of (await readdir(scriptsRoot)).filter((entry) => /^Install-.+\.ps1$/u.test(entry))) {
    const script = await read(name);
    if (/Invoke-RestMethod|Invoke-WebRequest/u.test(script)) assert.match(script, /_HiddenProcess\.ps1'\)/u, name);
  }
});
