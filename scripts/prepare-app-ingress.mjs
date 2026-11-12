#!/usr/bin/env node
// Prepare exact optional native dependencies for every architecture in a selected Desktop stage:
// App ingress (ngrok) and companion image processing (sharp).
// Usage: node scripts/prepare-app-ingress.mjs --platform <windows|macos|linux|all>
import { readFile, mkdir, cp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { appIngressNativePackages, imageNativePackages } from '../build/desktop/packaging.js';
import { resolveCommandInvocation } from './build-desktop-installer.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/prepare-app-ingress.mjs --platform <windows|macos|linux|all>');
} else {
  if (args.length !== 2 || args[0] !== '--platform') throw new Error('Select a Desktop platform.');
  const platforms = args[1] === 'all' ? ['windows', 'macos', 'linux'] : [args[1]];
  const root = fileURLToPath(new URL('..', import.meta.url));
  const exact = async (owner, names) => {
    const pkg = JSON.parse(await readFile(new URL(`../node_modules/${owner}/package.json`, import.meta.url), 'utf8'));
    return names.map(name => {
      const version = pkg.optionalDependencies?.[name];
      if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Expected an exact native dependency version.');
      return `${name}@${version}`;
    });
  };
  const names = [...appIngressNativePackages(platforms), ...imageNativePackages(platforms)];
  const selected = [
    ...await exact('@ngrok/ngrok', appIngressNativePackages(platforms)),
    ...await exact('sharp', imageNativePackages(platforms)),
  ];
  // --force permits foreign CPU/OS packages for cross builds. Lifecycle scripts remain disabled.
  // Use an isolated prefix so npm cannot prune or upgrade the build's locked dependencies.
  // npm verifies registry integrity; neither the source manifest nor its lockfile is rewritten.
  // The prefix stays outside build/native, which the installers ship as resources/native: a
  // second copy there would duplicate every native, and on macOS the universal merge refuses
  // the single-arch sharp natives at that path. It is removed once the packages are copied.
  const prefix = path.join(root, 'build', 'native-deps');
  await rm(prefix, { recursive: true, force: true });
  await mkdir(prefix, { recursive: true });
  const invocation = await resolveCommandInvocation('npm',
    ['install', '--prefix', prefix, '--no-save', '--package-lock=false', '--ignore-scripts', '--force', ...selected]);
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args,
      { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Native dependency preparation failed.')));
  });
  for (const name of names) {
    await cp(path.join(prefix, 'node_modules', name), path.join(root, 'node_modules', name), { recursive: true, force: true });
  }
  await rm(prefix, { recursive: true, force: true });
}
