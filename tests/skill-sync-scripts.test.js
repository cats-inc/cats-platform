import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('cats ships cross-platform skill sync helpers as repo-owned collaboration scripts', async () => {
  const windowsScript = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Sync-AgentSkills.ps1'),
    'utf8',
  );
  const linuxScript = await readFile(
    join(process.cwd(), 'scripts', 'linux', 'sync-agent-skills.sh'),
    'utf8',
  );
  const macosScript = await readFile(
    join(process.cwd(), 'scripts', 'macos', 'sync-agent-skills.sh'),
    'utf8',
  );
  const readme = await readFile(join(process.cwd(), 'scripts', 'README.md'), 'utf8');

  assert.match(windowsScript, /Join-Path \$ProjectRoot "\.claude" "skills"/);
  assert.match(windowsScript, /Join-Path \$ProjectRoot "\.agents" "skills"/);
  assert.match(windowsScript, /Join-Path \$ProjectRoot "\.gemini" "skills"/);
  assert.match(linuxScript, /\.claude\/skills/);
  assert.match(linuxScript, /\.agents\/skills/);
  assert.match(linuxScript, /\.gemini\/skills/);
  assert.match(macosScript, /Usage: sync-agent-skills\.sh/);
  assert.match(readme, /Sync-AgentSkills\.ps1/);
  assert.match(readme, /scripts\/linux\/sync-agent-skills\.sh/);
  assert.match(readme, /scripts\/macos\/sync-agent-skills\.sh/);
});
