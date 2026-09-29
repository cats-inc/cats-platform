import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPackage } from '@electron/asar';
import {
  classifyRuntimePacks,
  nugetPackagesRoot,
  renderNoticesReadme,
  resolveRuntimePacks,
  stageDotnetRuntimeNotices,
  verifyDotnetRuntimeNotices,
} from '../scripts/shared/dotnet-runtime-notices.mjs';
import { verifyDesktopLicenses } from '../scripts/verify-desktop-licenses.mjs';
import { seedRendererNotices, seedRuntimeNotices } from './fixtures/desktopLicenseFixture.js';

const DOTNET_LICENSE = `The MIT License (MIT)

Copyright (c) .NET Foundation and Contributors

All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED.
`;
const DOTNET_NOTICES = `.NET Runtime uses third-party libraries or other resources that may be
distributed under licenses different than the .NET Runtime software.
${'License details for a bundled component.\n'.repeat(40)}`;

const depsJson = (rid = 'win-x64', version = '8.0.31', sdk = '10.0.19041.57') => ({
  runtimeTarget: { name: `.NETCoreApp,Version=v8.0/${rid}` },
  targets: {
    '.NETCoreApp,Version=v8.0': {},
    [`.NETCoreApp,Version=v8.0/${rid}`]: {
      'cats-stt-windows/1.0.0': { dependencies: {} },
      [`runtimepack.Microsoft.NETCore.App.Runtime.${rid}/${version}`]: { runtime: {} },
      ...(sdk ? { [`runtimepack.Microsoft.Windows.SDK.NET.Ref/${sdk}`]: { runtime: {} } } : {}),
    },
  },
});

async function seedNugetRoot(root, rid = 'win-x64', version = '8.0.31') {
  const pack = join(root, `microsoft.netcore.app.runtime.${rid}`, version);
  await mkdir(pack, { recursive: true });
  await writeFile(join(pack, 'LICENSE.TXT'), DOTNET_LICENSE);
  await writeFile(join(pack, 'THIRD-PARTY-NOTICES.TXT'), DOTNET_NOTICES);
  return pack;
}

test('deps.json resolution names the exact runtime packs the helper was published with', () => {
  assert.deepEqual(resolveRuntimePacks(depsJson()), [
    { id: 'Microsoft.NETCore.App.Runtime.win-x64', version: '8.0.31' },
    { id: 'Microsoft.Windows.SDK.NET.Ref', version: '10.0.19041.57' },
  ]);
  assert.deepEqual(resolveRuntimePacks(depsJson('win-arm64', '8.0.32', null)), [
    { id: 'Microsoft.NETCore.App.Runtime.win-arm64', version: '8.0.32' },
  ]);
  assert.deepEqual(resolveRuntimePacks({}), []);
  const classified = classifyRuntimePacks(resolveRuntimePacks(depsJson()));
  assert.equal(classified.runtime.id, 'Microsoft.NETCore.App.Runtime.win-x64');
  assert.equal(classified.windowsSdk.version, '10.0.19041.57');
  assert.equal(classifyRuntimePacks(resolveRuntimePacks(depsJson('win-x64', '8.0.31', null))).windowsSdk, null);
  assert.throws(() => classifyRuntimePacks([]), /not self-contained/);
  assert.equal(nugetPackagesRoot({ NUGET_PACKAGES: 'D:\\nuget' }, 'C:\\home'), 'D:\\nuget');
  assert.equal(nugetPackagesRoot({}, join('C:', 'home')), join('C:', 'home', '.nuget', 'packages'));
});

test('the notices index names every Microsoft component and the Windows SDK license', () => {
  const readme = renderNoticesReadme({
    helperName: 'cats-stt-windows.exe',
    runtime: { id: 'Microsoft.NETCore.App.Runtime.win-x64', version: '8.0.31' },
    windowsSdk: { id: 'Microsoft.Windows.SDK.NET.Ref', version: '10.0.19041.57' },
  });
  assert.match(readme, /Microsoft\.NETCore\.App\.Runtime\.win-x64 8\.0\.31/);
  assert.match(readme, /MIT License/);
  assert.match(readme, /Microsoft\.Windows\.SDK\.NET\.Ref 10\.0\.19041\.57/);
  assert.match(readme, /Microsoft\.Windows\.SDK\.NET\.dll, WinRT\.Runtime\.dll/);
  assert.match(readme, /https:\/\/aka\.ms\/WinSDKLicenseURL/);
  const withoutSdk = renderNoticesReadme({
    helperName: 'cats-stt-windows.exe',
    runtime: { id: 'Microsoft.NETCore.App.Runtime.win-x64', version: '8.0.31' },
    windowsSdk: null,
  });
  assert.doesNotMatch(withoutSdk, /Windows SDK/);
});

test('staging copies the runtime pack notices from the NuGet cache and fails closed when they are missing', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-dotnet-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const nugetRoot = join(root, 'nuget');
  const outputDir = join(root, 'windows-stt');
  await mkdir(outputDir, { recursive: true });
  const depsJsonPath = join(outputDir, 'cats-stt-windows.deps.json');
  await writeFile(depsJsonPath, JSON.stringify(depsJson()));

  await assert.rejects(
    stageDotnetRuntimeNotices({ outputDir, depsJsonPath, helperName: 'cats-stt-windows.exe', nugetRoot }),
    /LICENSE\.TXT for Microsoft\.NETCore\.App\.Runtime\.win-x64 8\.0\.31 is missing/,
  );

  const pack = await seedNugetRoot(nugetRoot);
  const staged = await stageDotnetRuntimeNotices({
    outputDir, depsJsonPath, helperName: 'cats-stt-windows.exe', nugetRoot,
  });
  assert.equal(staged.runtime.version, '8.0.31');
  assert.deepEqual(staged.files, [
    join('licenses', 'dotnet-runtime', 'LICENSE.TXT'),
    join('licenses', 'dotnet-runtime', 'THIRD-PARTY-NOTICES.TXT'),
    join('licenses', 'README.txt'),
  ]);
  assert.deepEqual(
    await readFile(join(outputDir, 'licenses', 'dotnet-runtime', 'LICENSE.TXT')),
    await readFile(join(pack, 'LICENSE.TXT')),
  );
  assert.deepEqual(
    await readFile(join(outputDir, 'licenses', 'dotnet-runtime', 'THIRD-PARTY-NOTICES.TXT')),
    await readFile(join(pack, 'THIRD-PARTY-NOTICES.TXT')),
  );
  assert.match(await readFile(join(outputDir, 'licenses', 'README.txt'), 'utf8'), /Microsoft\.Windows\.SDK\.NET\.Ref 10\.0\.19041\.57/);
  assert.equal(await verifyDotnetRuntimeNotices(outputDir), true);

  // A different published version must not reuse notices from another pack.
  await writeFile(depsJsonPath, JSON.stringify(depsJson('win-x64', '8.0.32')));
  await assert.rejects(
    stageDotnetRuntimeNotices({ outputDir, depsJsonPath, helperName: 'cats-stt-windows.exe', nugetRoot }),
    /8\.0\.32 is missing/,
  );

  // Truncated or replaced texts are rejected by the same verifier the installer gate uses.
  await writeFile(join(outputDir, 'licenses', 'dotnet-runtime', 'LICENSE.TXT'), 'MIT');
  await assert.rejects(verifyDotnetRuntimeNotices(outputDir), /LICENSE\.TXT is missing or incomplete/);
  await writeFile(join(outputDir, 'licenses', 'dotnet-runtime', 'LICENSE.TXT'), DOTNET_LICENSE);
  await writeFile(join(outputDir, 'licenses', 'dotnet-runtime', 'THIRD-PARTY-NOTICES.TXT'), 'see upstream');
  await assert.rejects(verifyDotnetRuntimeNotices(outputDir), /THIRD-PARTY-NOTICES\.TXT is missing or truncated/);
});

test('installed Desktop resources that ship the Windows voice helper must ship its .NET notices', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-native-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resources = join(root, 'resources');
  const platform = join(resources, 'app-sidecar');
  const runtime = join(resources, 'cats-runtime');
  const bundle = join(runtime, 'build/runtime');
  const host = join(root, 'host');
  const helper = join(resources, 'native', 'windows-stt');
  for (const directory of [platform, bundle, host, helper]) await mkdir(directory, { recursive: true });
  const license = await readFile(new URL('../LICENSE', import.meta.url));
  for (const directory of [platform, runtime, host]) await writeFile(join(directory, 'LICENSE'), license);
  await createPackage(host, join(resources, 'app.asar'));
  await writeFile(join(resources, 'desktop-package-plan.json'), JSON.stringify({ sidecarLayout: { runtime: 'bundle' } }));
  await writeFile(join(bundle, 'index.js'), 'export {};');
  await seedRuntimeNotices(bundle, 'export {};');
  const renderer = join(platform, 'build', 'renderer');
  await mkdir(renderer, { recursive: true });
  await writeFile(join(renderer, 'index.html'), '<html></html>');
  await seedRendererNotices(renderer);

  // Helper binary present, notices absent: the gate must refuse.
  await writeFile(join(helper, 'cats-stt-windows.exe'), 'MZ');
  await assert.rejects(verifyDesktopLicenses(resources), /ENOENT/);

  const nugetRoot = join(root, 'nuget');
  await seedNugetRoot(nugetRoot);
  const depsJsonPath = join(helper, 'cats-stt-windows.deps.json');
  await writeFile(depsJsonPath, JSON.stringify(depsJson()));
  await stageDotnetRuntimeNotices({ outputDir: helper, depsJsonPath, helperName: 'cats-stt-windows.exe', nugetRoot });
  assert.deepEqual(await verifyDesktopLicenses(resources), {
    catsLicenses: true, rendererNotices: true, runtimeBundledNotices: true, nativeWindowsNotices: true,
  });

  await writeFile(join(helper, 'licenses', 'README.txt'), 'notices elsewhere');
  await assert.rejects(verifyDesktopLicenses(resources), /must name the \.NET runtime pack/);
});
