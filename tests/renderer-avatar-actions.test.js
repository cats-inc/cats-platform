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

    assert.match(source, /async function handleAvatarRemove\(\): Promise<void> \{/u);
    assert.match(source, /avatarUrl: nextAvatarUrl/u);
    assert.match(source, /await updateOwnerAvatar\(null, 'Failed to remove avatar'\)/u);
    assert.match(source, /className="secondaryButton"/u);
    assert.match(source, />\s*Remove avatar\s*</u);
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

    assert.match(source, /async function handleCatAvatarRemove\(\): Promise<void> \{/u);
    assert.match(source, /updateCatProfile\(cat\.id, \{ avatarUrl: null \}\)/u);
    assert.match(source, /className="secondaryButton"/u);
    assert.match(source, />\s*Remove avatar\s*</u);
  });
}
