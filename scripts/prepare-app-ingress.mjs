#!/usr/bin/env node
// Prepare exact optional native dependencies for every architecture in a selected Desktop stage.
// Usage: node scripts/prepare-app-ingress.mjs --platform <windows|macos|linux|all>
import { readFile, mkdir, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { appIngressNativePackages } from '../build/desktop/packaging.js';
import { resolveCommandInvocation } from './build-desktop-installer.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/prepare-app-ingress.mjs --platform <windows|macos|linux|all>');
} else {
  if (args.length !== 2 || args[0] !== '--platform') throw new Error('Select a Desktop platform.');
  const platforms = args[1] === 'all' ? ['windows', 'macos', 'linux'] : [args[1]];
  const root = fileURLToPath(new URL('..', import.meta.url));
  const pkg = JSON.parse(await readFile(new URL('../node_modules/@ngrok/ngrok/package.json', import.meta.url), 'utf8'));
  const names = appIngressNativePackages(platforms);
  const selected = names.map(name => {
    const version = pkg.optionalDependencies?.[name];
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Expected an exact native dependency version.');
    return `${name}@${version}`;
  });
  // --force permits foreign CPU/OS packages for cross builds. Lifecycle scripts remain disabled.
  // Use an isolated prefix so npm cannot prune or upgrade the build's locked dependencies.
  // npm verifies registry integrity; neither the source manifest nor its lockfile is rewritten.
  const prefix = path.join(root, 'build', 'native', 'app-ingress-deps');
  await mkdir(prefix, { recursive: true });
  const invocation = await resolveCommandInvocation('npm',
    ['install', '--prefix', prefix, '--no-save', '--package-lock=false', '--ignore-scripts', '--force', ...selected]);
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args,
      { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Native ingress preparation failed.')));
  });
  for (const name of names) {
    await cp(path.join(prefix, 'node_modules', name), path.join(root, 'node_modules', name), { recursive: true, force: true });
  }
}
