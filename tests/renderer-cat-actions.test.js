import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function readText(relativePath) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8');
}

function resolveSharedImplementationSource(productSource, sharedSource, sharedPattern) {
  return sharedPattern.test(productSource) ? sharedSource : productSource;
}

for (const product of ['chat', 'work', 'code']) {
  test(`${product} app navigation actions confirm before archiving cats from My Cats`, async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        'src',
        'products',
        product,
        'renderer',
        'hooks',
        'useAppNavigationActions.ts',
      ),
      'utf8',
    );

    assert.match(source, /const onArchiveCat = useCallback\(async \(catId: string\): Promise<void> => \{/u);
    assert.match(source, /title: 'Archive cat'/u);
    assert.match(source, /confirmLabel: 'Archive'/u);
    assert.match(source, /if \(!confirmed\) return;/u);
    assert.match(source, /updateCatProfile\(catId, \{ archive: true \}\)/u);
  });

  test(`${product} settings cats registry confirms before archiving cats`, async () => {
    const productSource = await readText(
      path.join('src', 'products', product, 'renderer', 'hooks', 'useSettingsCatsRegistryActions.ts'),
    );
    const sharedSource = await readText(
      path.join('src', 'products', 'shared', 'renderer', 'hooks', 'useSettingsCatsRegistryActions.ts'),
    );
    const source = resolveSharedImplementationSource(
      productSource,
      sharedSource,
      /shared\/renderer\/hooks\/useSettingsCatsRegistryActions\.js/u,
    );

    assert.match(source, /async function onArchiveCat\(catId: string, catName: string\): Promise<void> \{/u);
    assert.match(source, /title: 'Archive cat'/u);
    assert.match(source, /confirmLabel: 'Archive'/u);
    assert.match(source, /if \(!confirmed\) return;/u);
    assert.match(source, /updateCatProfile\(catId, \{ archive: true \}\)/u);
    assert.match(source, /async function onUnarchiveCat\(catId: string, catName: string\): Promise<void> \{/u);
    assert.match(source, /title: 'Recover cat'/u);
    assert.match(source, /confirmLabel: 'Recover'/u);
    assert.match(source, /updateCatProfile\(catId, \{ unarchive: true \}\)/u);
  });

  test(`${product} settings cats registry shows recover actions for archived cats`, async () => {
    const productSource = await readText(
      path.join('src', 'products', product, 'renderer', 'components', 'settings-cats', 'SettingsCatsRegistry.tsx'),
    );
    const sharedSource = await readText(
      path.join('src', 'products', 'shared', 'renderer', 'components', 'settings-cats', 'SettingsCatsRegistry.tsx'),
    );
    const source = resolveSharedImplementationSource(
      productSource,
      sharedSource,
      /shared\/renderer\/components\/settings-cats\/SettingsCatsRegistry\.js/u,
    );

    assert.match(source, /registryController\.onUnarchiveCat\(cat\.id, cat\.name\)/u);
    assert.match(source, />\s*Recover\s*</u);
  });
}
