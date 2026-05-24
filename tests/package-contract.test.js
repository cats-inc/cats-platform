import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testsDir, '..');
const packageJsonPath = join(projectRoot, 'package.json');

let buildReady = false;

function readPackageManifest() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8'));
}

function resolveNodeCliScript(command) {
  const scriptName = command === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const candidates = [];

  if (command === 'npm' && process.env.npm_execpath?.trim()) {
    candidates.push(resolve(process.env.npm_execpath.trim()));
  }

  const nodeDir = dirname(process.execPath);
  candidates.push(resolve(nodeDir, 'node_modules', 'npm', 'bin', scriptName));
  candidates.push(resolve(nodeDir, '..', 'node_modules', 'npm', 'bin', scriptName));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runNpmCommand(args, options = {}) {
  const npmCliPath = resolveNodeCliScript('npm');
  const command = npmCliPath ? process.execPath : 'npm';
  const commandArgs = npmCliPath ? [npmCliPath, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
      npm_config_loglevel: 'silent',
    },
    shell: !npmCliPath && process.platform === 'win32',
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr
      || result.stdout
      || result.error?.message
      || `npm ${args.join(' ')} failed`,
    );
  }

  return result.stdout;
}

function runNodeCommand(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
    windowsHide: true,
  });
}

function runBuild() {
  runNpmCommand(['run', 'build']);
  buildReady = true;
}

function ensureBuild() {
  if (!buildReady) {
    runBuild();
  }
}

function runPackDryRun() {
  const stdout = runNpmCommand(['pack', '--json', '--dry-run', '--ignore-scripts']);
  const payload = JSON.parse(stdout.trim());

  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error(`Unexpected npm pack payload: ${stdout}`);
  }

  return payload[0];
}

function runPack() {
  const stdout = runNpmCommand(['pack', '--json', '--ignore-scripts']);
  const payload = JSON.parse(stdout.trim());

  if (!Array.isArray(payload) || payload.length !== 1 || !payload[0]?.filename) {
    throw new Error(`Unexpected npm pack payload: ${stdout}`);
  }

  return {
    packed: payload[0],
    tarballPath: join(projectRoot, payload[0].filename),
  };
}

test('package.json keeps the self-hosted npm executable contract aligned with packed contents', () => {
  ensureBuild();

  const manifest = readPackageManifest();
  const packed = runPackDryRun();
  const packedPaths = new Set(packed.files.map((entry) => entry.path));

  assert.deepEqual(manifest.bin, {
    'cats-platform': './build/server/index.js',
  });
  assert.deepEqual(manifest.files, [
    'build/renderer',
    'build/server',
    'build/desktop',
    'scripts',
    'config/provider-capability-bootstrap.yaml.example',
    '.env.example',
    'README.md',
    'LICENSE',
  ]);
  assert.equal(manifest.scripts.prepack, 'npm run build');

  assert.equal(packed.name, '@cats-inc/cats-platform');
  assert.ok(packed.version);
  assert.equal(packedPaths.has('.env.example'), true);
  assert.equal(packedPaths.has('LICENSE'), true);
  assert.equal(packedPaths.has('README.md'), true);
  assert.equal(packedPaths.has('build/renderer/index.html'), true);
  assert.equal(packedPaths.has('build/server/index.js'), true);
  assert.equal(packedPaths.has('build/desktop/main.js'), true);
  assert.equal(packedPaths.has('build/desktop/preload.cjs'), true);
  assert.equal(packedPaths.has('scripts/linux/install-node.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-github-cli.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-codex.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-antigravity.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-copilot.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-opencode.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-kilo.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-auggie.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-pi.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/install-claude-code.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/check-installation.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-node.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-github-cli.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-codex.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-antigravity.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-copilot.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-opencode.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-kilo.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-auggie.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-pi.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/install-claude-code.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/check-installation.sh'), true);
  assert.equal(packedPaths.has('scripts/windows/_NpmCliInstaller.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-Node.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-GitHubCli.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-Codex.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-Antigravity.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-Copilot.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-OpenCode.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-KiloCli.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-Auggie.ps1'), true);
  assert.equal(packedPaths.has('scripts/windows/Install-Pi.ps1'), true);
  assert.equal(packedPaths.has('scripts/linux/provider-cli-common.sh'), true);
  assert.equal(packedPaths.has('scripts/linux/node-cli-common.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/provider-cli-common.sh'), true);
  assert.equal(packedPaths.has('scripts/macos/node-cli-common.sh'), true);
  assert.equal(packedPaths.has('package.json'), true);

  assert.equal([...packedPaths].some((path) => path.startsWith('src/')), false);
  assert.equal([...packedPaths].some((path) => path.startsWith('tests/')), false);
  assert.equal([...packedPaths].some((path) => path.startsWith('docs/')), false);
  assert.equal([...packedPaths].some((path) => path.startsWith('mobile/')), false);
  assert.equal([...packedPaths].some((path) => path.startsWith('node_modules/')), false);
  assert.equal(packedPaths.has('tsconfig.json'), false);
  assert.equal(packedPaths.has('vite.config.ts'), false);
});

test('build removes stale packaged output before npm pack snapshots it', () => {
  const stalePaths = [
    join(projectRoot, 'build', 'renderer', 'stale', 'old-artifact.txt'),
    join(projectRoot, 'build', 'server', 'stale', 'old-artifact.txt'),
    join(projectRoot, 'build', 'desktop', 'stale', 'old-artifact.txt'),
  ];

  for (const stalePath of stalePaths) {
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, 'stale\n', 'utf8');
    assert.equal(existsSync(stalePath), true);
  }

  runBuild();

  for (const stalePath of stalePaths) {
    assert.equal(existsSync(stalePath), false);
  }

  const packed = runPackDryRun();
  const packedPaths = new Set(packed.files.map((entry) => entry.path));
  assert.equal(packedPaths.has('build/renderer/stale/old-artifact.txt'), false);
  assert.equal(packedPaths.has('build/server/stale/old-artifact.txt'), false);
  assert.equal(packedPaths.has('build/desktop/stale/old-artifact.txt'), false);
});

test('local tarball install exposes the cats-platform executable entrypoint', () => {
  ensureBuild();

  const installRoot = mkdtempSync(join(tmpdir(), 'cats-pack-install-'));
  const npmCache = join(installRoot, '.npm-cache');
  const consumerDir = join(installRoot, 'consumer');

  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'cats-pack-smoke',
    private: true,
  }, null, 2), 'utf8');

  let tarballPath = '';

  try {
    const packed = runPack();
    tarballPath = packed.tarballPath;

    runNpmCommand(['install', '--no-package-lock', '--ignore-scripts', tarballPath], {
      cwd: consumerDir,
      env: {
        npm_config_cache: npmCache,
      },
    });

    const installedRoot = join(consumerDir, 'node_modules', '@cats-inc', 'cats-platform');
    const linkedBinPath = join(
      consumerDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'cats-platform.cmd' : 'cats-platform',
    );
    const installedManifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
    const installedBinRelativePath = typeof installedManifest.bin === 'string'
      ? installedManifest.bin
      : installedManifest.bin?.['cats-platform'];
    const installedBinTargetPath = installedBinRelativePath
      ? join(installedRoot, installedBinRelativePath)
      : '';

    assert.equal(existsSync(installedRoot), true);
    assert.equal(existsSync(linkedBinPath), true);
    assert.equal(existsSync(installedBinTargetPath), true);

    const helpResult = runNodeCommand([installedBinTargetPath, '--help'], {
      cwd: consumerDir,
    });

    assert.equal(helpResult.status, 0);
    assert.match(helpResult.stdout, /Usage: cats-platform \[options\]/u);
  } finally {
    if (tarballPath) {
      rmSync(tarballPath, { force: true });
    }
    rmSync(installRoot, { recursive: true, force: true });
  }
});
