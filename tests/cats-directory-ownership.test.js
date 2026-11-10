import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Cats Directory owns the cat roster and the add-cat flow (SPEC-102).
// Settings keeps only app-level pages, so nothing may route a user to the
// retired `/settings/cats` pages. `appPackageRoutes.ts` still lists the
// path, on purpose: it stays reserved so an App cannot claim it.
const RESERVED_PATH_OWNER = path.join('src', 'app', 'server', 'appPackageRoutes.ts');

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listSourceFiles(entryPath);
    }
    return /\.(?:ts|tsx|js|mjs)$/u.test(entry.name) ? [entryPath] : [];
  }));
  return files.flat();
}

test('no source routes users to the retired /settings/cats pages', async () => {
  const roots = [path.join('src'), path.join('mobile', 'src')];
  const files = (await Promise.all(roots.map((root) => listSourceFiles(root)))).flat();
  const offenders = [];
  for (const file of files) {
    if (file === RESERVED_PATH_OWNER) continue;
    const source = await readFile(file, 'utf8');
    if (/['"`]\/settings\/cats/u.test(source)) offenders.push(file);
  }

  assert.deepEqual(offenders, []);
});

test('the retired /settings/cats path stays reserved against App routes', async () => {
  const source = await readFile(RESERVED_PATH_OWNER, 'utf8');

  assert.match(source, /'\/settings\/cats',/u);
});

test('every add-cat entry point opens the Cats Directory add-cat route', async () => {
  const sources = await Promise.all([
    path.join('src', 'products', 'shared', 'renderer', 'components', 'cats', 'Cats.tsx'),
    path.join('src', 'app', 'renderer', 'entities-shell', 'EntitiesAppShellSidebar.tsx'),
    path.join('src', 'app', 'renderer', 'entities', 'EntityIndexCards.tsx'),
    path.join('src', 'products', 'shared', 'renderer', 'hooks', 'useWorkspaceAppNavigationActions.ts'),
  ].map(async (file) => [file, await readFile(file, 'utf8')]));

  for (const [file, source] of sources) {
    assert.match(source, /CATS_DIRECTORY_NEW_CAT_PATH/u, file);
  }
  const paths = await readFile(path.join('src', 'shared', 'catsDirectoryPaths.ts'), 'utf8');
  assert.match(paths, /export const CATS_DIRECTORY_PATH = '\/entities\/cats';/u);
  assert.match(paths, /export const CATS_DIRECTORY_NEW_CAT_PATH = '\/entities\/cats\/new';/u);
});

test('the Settings sidebar lists Assistants on its own, with no Cats group', async () => {
  const source = await readFile(
    path.join('src', 'app', 'renderer', 'settings', 'SettingsAppShellSidebar.tsx'),
    'utf8',
  );

  assert.match(source, /navigate\('\/settings\/assistants'\)/u);
  assert.doesNotMatch(source, /settingsSidebarGroupHeading/u);
  assert.doesNotMatch(source, /settingsShellSectionCats/u);
});
