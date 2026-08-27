import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const rootDir = process.cwd();
const bashExecutable = process.platform === 'win32'
  ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'bash.exe')
  : 'bash';

function toBashPath(value) {
  const normalized = value.replace(/\\/gu, '/');
  if (process.platform !== 'win32') {
    return normalized;
  }

  return normalized.replace(/^([A-Za-z]):\//u, (_match, drive) => `/mnt/${drive.toLowerCase()}/`);
}

const linuxScripts = [
  'setup-node-global-prefix.sh',
  'install-node.sh',
  'install-github-cli.sh',
  'install-codex.sh',
  'install-antigravity.sh',
  'install-grok.sh',
  'install-copilot.sh',
  'install-opencode.sh',
  'install-kilo.sh',
  'install-auggie.sh',
  'install-pi.sh',
  'install-claude-code.sh',
  'install-cursor-agent.sh',
  'install-goose.sh',
  'install-junie.sh',
  'install-kiro-cli.sh',
  'upgrade-cli-tools.sh',
  'check-installation.sh',
];

const macosScripts = [
  'setup-node-global-prefix.sh',
  'install-node.sh',
  'install-github-cli.sh',
  'install-codex.sh',
  'install-antigravity.sh',
  'install-grok.sh',
  'install-copilot.sh',
  'install-opencode.sh',
  'install-kilo.sh',
  'install-auggie.sh',
  'install-pi.sh',
  'install-claude-code.sh',
  'install-cursor-agent.sh',
  'install-goose.sh',
  'install-junie.sh',
  'install-kiro-cli.sh',
  'upgrade-cli-tools.sh',
  'check-installation.sh',
];

async function assertHelp(scriptPath) {
  const bashPath = relative(rootDir, scriptPath).replace(/\\/gu, '/');
  const { stdout } = await execFile('bash', [bashPath, '--help'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(stdout, /Usage:/u);
}

async function readJsonSummary(scriptPath, extraArgs = [], jsonFlag = '--json') {
  const bashPath = relative(rootDir, scriptPath).replace(/\\/gu, '/');
  const { stdout } = await execFile('bash', [bashPath, jsonFlag, ...extraArgs], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}

test('cats-platform ships repo-owned Unix self-hosted provider helpers', async () => {
  for (const scriptName of linuxScripts) {
    const script = await readFile(join(rootDir, 'scripts', 'linux', scriptName), 'utf8');
    assert.match(script, /^#!\/usr\/bin\/env bash/u);
  }

  for (const scriptName of macosScripts) {
    const script = await readFile(join(rootDir, 'scripts', 'macos', scriptName), 'utf8');
    assert.match(script, /^#!\/usr\/bin\/env bash/u);
  }

  const readme = await readFile(join(rootDir, 'scripts', 'README.md'), 'utf8');
  assert.match(readme, /scripts\/linux\/install-codex\.sh/u);
  assert.match(readme, /scripts\/macos\/install-codex\.sh/u);
  assert.match(readme, /scripts\/linux\/upgrade-cli-tools\.sh/u);
  assert.match(readme, /scripts\/macos\/upgrade-cli-tools\.sh/u);
});

test('Unix self-hosted provider helpers expose help text without mutating the host', async () => {
  for (const platform of ['linux', 'macos']) {
    await assertHelp(join(rootDir, 'scripts', platform, 'setup-node-global-prefix.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-claude-code.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-cursor-agent.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-goose.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-junie.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-kiro-cli.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'install-grok.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'upgrade-cli-tools.sh'));
    await assertHelp(join(rootDir, 'scripts', platform, 'check-installation.sh'));
  }
});

test('Unix Grok helpers detect only grok and uninstall only fixed installer-owned paths', async () => {
  for (const platform of ['linux', 'macos']) {
    const home = await mkdtemp(join(tmpdir(), `cats-${platform}-grok-home-`));
    const unrelatedBin = await mkdtemp(join(tmpdir(), `cats-${platform}-agent-bin-`));
    const grokBin = join(home, '.grok', 'bin');
    const grokPath = join(grokBin, 'grok');
    const installerAliasPath = join(grokBin, 'agent');
    const unrelatedAgentPath = join(unrelatedBin, 'agent');
    const helperPath = join(rootDir, 'scripts', platform, 'install-grok.sh');
    const bashPath = relative(rootDir, helperPath).replace(/\\/gu, '/');
    const fixturePath = `${toBashPath(unrelatedBin)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;
    const env = {
      ...process.env,
      HOME: toBashPath(home),
      PATH: fixturePath,
    };
    const runHelper = (args) => process.platform === 'win32'
      ? execFile(bashExecutable, [
          '-c',
          'export HOME="$CATS_GROK_TEST_HOME" PATH="$CATS_GROK_TEST_PATH"; exec /bin/bash "$CATS_GROK_TEST_SCRIPT" "$CATS_GROK_TEST_ARG1" "$CATS_GROK_TEST_ARG2"',
        ], {
          cwd: rootDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            CATS_GROK_TEST_HOME: toBashPath(home),
            CATS_GROK_TEST_PATH: fixturePath,
            CATS_GROK_TEST_SCRIPT: bashPath,
            CATS_GROK_TEST_ARG1: args[0],
            CATS_GROK_TEST_ARG2: args[1],
            WSLENV: [
              process.env.WSLENV,
              'CATS_GROK_TEST_HOME',
              'CATS_GROK_TEST_PATH',
              'CATS_GROK_TEST_SCRIPT',
              'CATS_GROK_TEST_ARG1',
              'CATS_GROK_TEST_ARG2',
            ].filter(Boolean).join(':'),
          },
        })
      : execFile(bashExecutable, [bashPath, ...args], { cwd: rootDir, encoding: 'utf8', env });

    try {
      await mkdir(grokBin, { recursive: true });
      await writeFile(unrelatedAgentPath, '#!/usr/bin/env bash\nprintf "unrelated agent\\n"\n');
      await chmod(unrelatedAgentPath, 0o755);

      const missing = JSON.parse((await runHelper(['--check', '--json'])).stdout);
      assert.equal(missing.installed, false);

      await writeFile(grokPath, '#!/usr/bin/env bash\nprintf "grok 1.2.3\\n"\n');
      await writeFile(installerAliasPath, '#!/usr/bin/env bash\nprintf "installer alias\\n"\n');
      await chmod(grokPath, 0o755);
      await chmod(installerAliasPath, 0o755);

      const installed = JSON.parse((await runHelper(['--check', '--json'])).stdout);
      assert.equal(installed.installed, true, JSON.stringify(installed));
      assert.equal(installed.commandPath, toBashPath(grokPath));
      assert.match(installed.detectedVersion, /grok 1\.2\.3/u);

      const removed = JSON.parse((await runHelper(['--uninstall', '--json'])).stdout);
      assert.equal(removed.status, 'uninstalled');
      await assert.rejects(access(grokPath));
      await assert.rejects(access(installerAliasPath));
      await access(unrelatedAgentPath);
      assert.doesNotMatch(JSON.stringify(removed), new RegExp(toBashPath(unrelatedAgentPath).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(unrelatedBin, { recursive: true, force: true });
    }
  }
});

test('Unix Antigravity helpers publish the bash-style setup flag contract', async () => {
  for (const platform of ['linux', 'macos']) {
    const bashPath = relative(
      rootDir,
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
    ).replace(/\\/gu, '/');
    const { stdout } = await execFile('bash', [bashPath, '--help'], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    assert.match(stdout, /--check/u);
    assert.match(stdout, /--apply/u);
    assert.match(stdout, /--upgrade/u);
    assert.match(stdout, /--force/u);
    assert.match(stdout, /--uninstall/u);
    assert.match(stdout, /--dry-run/u);
    assert.match(stdout, /--json/u);
    assert.doesNotMatch(stdout, /-CheckOnly/u);
    assert.doesNotMatch(stdout, /-Upgrade/u);
  }
});

test('Unix Antigravity helpers accept bash-style aliases', async () => {
  for (const platform of ['linux', 'macos']) {
    const bashPath = relative(
      rootDir,
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
    ).replace(/\\/gu, '/');

    const checkSummary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
      ['--check'],
    );
    assert.equal(checkSummary.helper, `${platform}-antigravity-native-installer`);
    assert.equal(checkSummary.mode, 'check');

    const upgradeSummary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
      ['--dry-run', '--upgrade'],
    );
    assert.equal(upgradeSummary.mode, 'upgrade');
    assert.equal(upgradeSummary.status, 'preview');
  }
});

test('Unix Antigravity helpers keep packaged bridge aliases as compatibility input', async () => {
  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
      ['-DryRun', '-Force'],
      '-Json',
    );

    assert.equal(summary.helper, `${platform}-antigravity-native-installer`);
    assert.equal(summary.mode, 'force');
    assert.equal(summary.status, 'preview');
  }
});

test('Unix Antigravity helpers reject conflicting mutation flags', async () => {
  for (const platform of ['linux', 'macos']) {
    const bashPath = relative(
      rootDir,
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
    ).replace(/\\/gu, '/');

    await assert.rejects(
      execFile('bash', [bashPath, '--apply', '--upgrade'], {
        cwd: rootDir,
        encoding: 'utf8',
      }),
      /at most one of --apply \/ --upgrade \/ --force/u,
    );
  }
});

test('Unix Antigravity helpers dry-run mutation modes without invoking installers', async () => {
  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'install-antigravity.sh'),
      ['--dry-run', '--force'],
    );

    assert.equal(summary.helper, `${platform}-antigravity-native-installer`);
    assert.equal(summary.mode, 'force');
    assert.equal(summary.status, 'preview');
    assert.deepEqual(summary.plannedActions, ['reinstall_antigravity_cli']);
    assert.deepEqual(summary.appliedChanges, []);
    assert.deepEqual(summary.interruptions, []);
    assert.match(summary.warnings.join('\n'), /Dry-run requested/u);
  }
});

test('Unix Antigravity helpers own refresh before invoking the official installer', async () => {
  for (const platform of ['linux', 'macos']) {
    const commonScript = await readFile(
      join(rootDir, 'scripts', platform, 'provider-cli-common.sh'),
      'utf8',
    );

    assert.match(
      commonScript,
      /curl -fsSL "\$url" \| bash/u,
    );
    assert.match(
      commonScript,
      /rm -f "\$HOME\/\.local\/bin\/agy" \|\| true/u,
    );
    assert.doesNotMatch(commonScript, /run_remote_pipe_installer "\$provider" '-upgrade'/u);
    assert.doesNotMatch(commonScript, /run_remote_pipe_installer "\$provider" '-force'/u);
  }
});

test('Unix Antigravity helpers keep uninstall scoped to the agy binary path', async () => {
  for (const platform of ['linux', 'macos']) {
    const commonScript = await readFile(
      join(rootDir, 'scripts', platform, 'provider-cli-common.sh'),
      'utf8',
    );

    assert.match(commonScript, /\$HOME\/\.local\/bin\/agy/u);
    assert.match(commonScript, /uninstall_provider_native_paths\(\)/u);
    assert.doesNotMatch(commonScript, /\.gemini\/antigravity-cli/u);
    assert.doesNotMatch(commonScript, /plugins\/|settings\.json/u);
  }
});

test('Unix bulk upgrade keeps Antigravity in the native provider pass', async () => {
  for (const platform of ['linux', 'macos']) {
    const script = await readFile(
      join(rootDir, 'scripts', platform, 'upgrade-cli-tools.sh'),
      'utf8',
    );
    const [nativePass, nodePass = ''] = script.split("if [ \"$skip_node\" = 'false' ]; then");

    assert.match(
      nativePass,
      /install-claude-code\.sh install-antigravity\.sh install-cursor-agent\.sh/u,
    );
    assert.doesNotMatch(nodePass, /install-antigravity\.sh/u);
  }
});

test('Unix npm pack installs Pi from the renamed package and drops the superseded one', async () => {
  // npm resolves the abandoned name to its final published version and reports
  // it as current forever, so pointing at it silently disables every Pi upgrade.
  for (const platform of ['linux', 'macos']) {
    const common = await readFile(
      join(rootDir, 'scripts', platform, 'node-cli-common.sh'),
      'utf8',
    );

    assert.match(common, /pi\|pi\|@earendil-works\/pi-coding-agent\|Pi CLI/u);
    assert.doesNotMatch(common, /pi\|pi\|@mariozechner\/pi-coding-agent/u);

    // The superseded package must be removed, not merely unreferenced: two
    // packages shipping the same bin resolve the shim by install order.
    assert.match(
      common,
      /node_cli_superseded_packages[\s\S]*@earendil-works\/pi-coding-agent[\s\S]*@mariozechner\/pi-coding-agent/u,
    );
    assert.match(common, /remove_superseded_npm_packages "\$package_name"/u);

    const solo = await readFile(join(rootDir, 'scripts', platform, 'install-pi.sh'), 'utf8');
    assert.match(solo, /@earendil-works\/pi-coding-agent/u);
    assert.doesNotMatch(solo, /@mariozechner/u);
  }
});

test('Unix npm pack never removes superseded packages during a check', async () => {
  for (const platform of ['linux', 'macos']) {
    const common = await readFile(
      join(rootDir, 'scripts', platform, 'node-cli-common.sh'),
      'utf8',
    );

    // --check must stay read-only; every removal *call* sits behind a non-check
    // guard. The function definition itself is skipped by matching the argument.
    for (const match of common.matchAll(/remove_superseded_npm_packages "\$package_name"/gu)) {
      const preceding = common.slice(Math.max(0, match.index - 220), match.index);
      assert.match(
        preceding,
        /check_only" != 'true'/u,
        `unguarded superseded removal in ${platform}/node-cli-common.sh`,
      );
    }
  }
});

test('Unix self-hosted provider audits expose the shared JSON audit core', async () => {
  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'check-installation.sh'),
    );

    assert.equal(summary.helper, 'self-hosted-cli-check');
    assert.equal(summary.platform, platform);
    assert.equal(summary.collectionMode, 'parallel');
    assert.equal(typeof summary.ready, 'boolean');
    assert.match(summary.status, /^(ready|changes_required)$/u);
    assert.equal(Array.isArray(summary.plannedActions), true);
    assert.equal(Array.isArray(summary.manualSteps), true);
    assert.equal(Array.isArray(summary.interruptions), true);
    assert.equal(Array.isArray(summary.checks), true);
    assert.equal(Array.isArray(summary.phases), true);
    assert.equal(Array.isArray(summary.warnings), true);
    assert.equal(summary.phases.length, 1);
    assert.equal(summary.present + summary.missing, summary.checks.length);
  }
});

/**
 * The audit owns prerequisites; cats-runtime's setup scan owns provider
 * presence. The scan probes every provider CLI once and reports a version and
 * a probe-backed auth status, and it is the source the desktop host's CLI
 * inventory reads -- auditing the same CLIs here produced a second, weaker
 * answer that nothing consumed. Windows dropped its copy of that work in #7;
 * this is the same contract on macOS and Linux.
 */
test('Unix self-hosted provider audits check prerequisites only, never provider CLIs', async () => {
  const expectedCheckIds = ['node', 'npm', 'docker', 'node_prefix'];
  const providerCheckIds = [
    'claude', 'antigravity', 'cursor', 'goose', 'junie', 'kiro', 'grok',
    'codex', 'copilot', 'opencode', 'kilo', 'auggie', 'pi', 'cline',
  ];

  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'check-installation.sh'),
    );

    assert.deepEqual(summary.checks.map((entry) => entry.id), expectedCheckIds);
    for (const checkId of providerCheckIds) {
      assert.equal(
        summary.checks.some((entry) => entry.id === checkId),
        false,
        `${checkId} is the setup scan's to report, not the audit's`,
      );
    }
    assert.deepEqual(summary.phases.map((phase) => phase.id), ['core']);
    assert.equal(
      summary.plannedActions.some((action) => action.startsWith('provider:')),
      false,
    );
    assert.equal(summary.plannedActions.includes('repair_native_cli_pack'), false);
  }
});

test('Unix self-hosted provider audits still cover the optional local model runtime', async () => {
  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'check-installation.sh'),
      ['--include-local-models'],
    );

    assert.equal(summary.collectionMode, 'parallel');
    assert.equal(summary.checks.some((entry) => entry.id === 'ollama'), true);
    assert.deepEqual(summary.phases.map((phase) => phase.id), ['core', 'local_model_pack']);
    assert.equal(summary.present + summary.missing, summary.checks.length);
  }
});

test('Unix self-hosted provider audits can switch to serial collection mode', async () => {
  for (const platform of ['linux', 'macos']) {
    const summary = await readJsonSummary(
      join(rootDir, 'scripts', platform, 'check-installation.sh'),
      ['--serial', '--include-local-models'],
    );

    assert.equal(summary.collectionMode, 'serial');
    assert.equal(Array.isArray(summary.checks), true);
    assert.equal(summary.checks.length > 0, true);
  }
});

/**
 * These five helpers exist as byte-identical copies under scripts/linux and
 * scripts/macos rather than as one shared file: the packaged setup asset list
 * stages each platform's tree separately, so both have to be on disk. Nothing
 * else checks that they still match, which makes "edit one, forget the other"
 * a silent divergence that only surfaces on the platform nobody tested.
 *
 * The 24 other shared filenames (install-node.sh, install-claude-code.sh, and
 * the rest of the installers) are deliberately platform-specific and must not
 * be listed here.
 */
const IDENTICAL_UNIX_HELPER_COPIES = [
  'node-cli-common.sh',
  'provider-cli-common.sh',
  'start-desktop-host.sh',
  'sync-agent-skills.sh',
  'upgrade-cli-tools.sh',
];

test('the unix helpers kept as two copies stay identical', async () => {
  for (const name of IDENTICAL_UNIX_HELPER_COPIES) {
    const [linuxSource, macosSource] = await Promise.all([
      readFile(join(rootDir, 'scripts', 'linux', name), 'utf8'),
      readFile(join(rootDir, 'scripts', 'macos', name), 'utf8'),
    ]);

    if (linuxSource === macosSource) {
      continue;
    }

    // Point at the divergence rather than just reporting inequality: the
    // largest of these is ~1400 lines, and a bare "not equal" sends the reader
    // off to diff by hand.
    const linuxLines = linuxSource.split(/\r?\n/u);
    const macosLines = macosSource.split(/\r?\n/u);
    const limit = Math.max(linuxLines.length, macosLines.length);
    let divergedAt = limit;
    for (let index = 0; index < limit; index += 1) {
      if (linuxLines[index] !== macosLines[index]) {
        divergedAt = index + 1;
        break;
      }
    }

    assert.fail([
      `scripts/linux/${name} and scripts/macos/${name} diverged at line ${divergedAt}.`,
      `  linux: ${JSON.stringify(linuxLines[divergedAt - 1] ?? '<end of file>')}`,
      `  macos: ${JSON.stringify(macosLines[divergedAt - 1] ?? '<end of file>')}`,
      'These two are maintained as copies; every change has to be applied to both.',
    ].join('\n'));
  }
});
