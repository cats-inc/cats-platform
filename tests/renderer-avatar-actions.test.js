import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('platform general settings can remove the owner avatar', async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      'src',
      'app',
      'renderer',
      'settings',
      'PlatformSettingsGeneral.tsx',
    ),
    'utf8',
  );

  assert.match(source, /async function updateOwnerAvatar\(/u);
  assert.match(source, /ownerAvatarUrl: nextAvatarUrl/u);
  assert.match(source, /className="settingsOwnerAvatarRemove"/u);
  assert.match(source, /event\.stopPropagation\(\);/u);
  assert.match(source, /updateOwnerAvatar\(null, t\('settingsGeneralRemoveAvatarError'\)\)/u);
  assert.match(source, /aria-label=\{t\('settingsGeneralAvatarRemoveLabel'\)\}/u);
  assert.match(source, /data-tooltip=\{t\('settingsGeneralAvatarRemoveLabel'\)\}/u);
});

test('product renderer settings wrappers for general and data pages were removed', async () => {
  const removedPaths = [
    'src/products/chat/renderer/components/SettingsGeneral.tsx',
    'src/products/chat/renderer/components/SettingsData.tsx',
    'src/products/chat/renderer/components/SettingsShell.tsx',
    'src/products/code/renderer/components/SettingsGeneral.tsx',
    'src/products/code/renderer/components/SettingsData.tsx',
    'src/products/code/renderer/components/SettingsShell.tsx',
    'src/products/work/renderer/components/SettingsGeneral.tsx',
    'src/products/work/renderer/components/SettingsData.tsx',
    'src/products/work/renderer/components/SettingsShell.tsx',
    'src/products/shared/renderer/components/SettingsGeneral.tsx',
    'src/products/shared/renderer/components/SettingsData.tsx',
    'src/products/shared/renderer/components/SettingsShell.tsx',
  ];

  await Promise.all(removedPaths.map(async (relativePath) => {
    await assert.rejects(
      access(path.join(process.cwd(), relativePath)),
      (error) => Boolean(error && typeof error === 'object' && error.code === 'ENOENT'),
    );
  }));
});

for (const product of ['chat', 'work', 'code']) {
  test(`${product} cat settings can remove uploaded cat avatars`, async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        'src',
        'products',
        product,
        'renderer',
        'components',
        'settings-cats',
        'SettingsCatsDetailPanel.tsx',
      ),
      'utf8',
    );
    const implementationSource = source.includes(
      "shared/renderer/components/settings-cats/SettingsCatsDetailPanel.js",
    )
      ? await readFile(
        path.join(
          process.cwd(),
          'src',
          'products',
          'shared',
          'renderer',
          'components',
          'settings-cats',
          'SettingsCatsDetailPanel.tsx',
        ),
        'utf8',
      )
      : source;

    if (implementationSource !== source) {
      assert.match(
        source,
        /shared\/renderer\/components\/settings-cats\/SettingsCatsDetailPanel\.js/u,
      );
    }

    assert.match(implementationSource, /async function handleCatAvatarRemove\(\): Promise<void> \{/u);
    assert.match(implementationSource, /updateCatProfile\(cat\.id, \{ avatarUrl: null \}\)/u);
    assert.match(implementationSource, /className="secondaryButton"/u);
    assert.match(implementationSource, /\{t\(messageKeys\.settingsGeneralAvatarRemoveLabel\)\}/u);
  });
}
