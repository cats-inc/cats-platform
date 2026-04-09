import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

for (const product of ['chat', 'work', 'code']) {
  test(`${product} general settings can remove the owner avatar`, async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        'src',
        'products',
        product,
        'renderer',
        'components',
        'SettingsGeneral.tsx',
      ),
      'utf8',
    );
    const implementationSource = source.includes("shared/renderer/components/SettingsGeneral.js")
      ? await readFile(
        path.join(
          process.cwd(),
          'src',
          'products',
          'shared',
          'renderer',
          'components',
          'SettingsGeneral.tsx',
        ),
        'utf8',
      )
      : source;

    if (implementationSource !== source) {
      assert.match(source, /shared\/renderer\/components\/SettingsGeneral\.js/u);
    }

    assert.match(implementationSource, /async function handleAvatarRemove\(\): Promise<void> \{/u);
    assert.match(implementationSource, /avatarUrl: nextAvatarUrl/u);
    assert.match(implementationSource, /await updateOwnerAvatar\(null, 'Failed to remove avatar'\)/u);
    assert.match(implementationSource, /className="secondaryButton"/u);
    assert.match(implementationSource, />\s*Remove avatar\s*</u);
  });

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
    assert.match(implementationSource, />\s*Remove avatar\s*</u);
  });
}
