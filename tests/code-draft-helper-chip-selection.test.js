import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('code draft helper chip selection keeps chips visible across default, team, and peer drafts', async () => {
  const codeDraftSource = await readFile(
    path.join(process.cwd(), 'src', 'products', 'code', 'renderer', 'components', 'NewChatDraft.tsx'),
    'utf8',
  );
  const sharedDraftSource = await readFile(
    path.join(process.cwd(), 'src', 'products', 'shared', 'renderer', 'components', 'ChatNewChatDraft.tsx'),
    'utf8',
  );

  assert.match(codeDraftSource, /preserveHelperChipsOnSelect/u);
  assert.match(codeDraftSource, /leadingStarterChips=\{[\s\S]*helperChips\.map/u);
  assert.match(
    codeDraftSource,
    /onSelectHelperChip: \(prompt\) => \{\s*props\.onComposerChange\(prompt\);\s*\}/u,
  );
  assert.doesNotMatch(
    codeDraftSource,
    /onSelectHelperChip: \(prompt\) => \{[\s\S]*dismissDraftHelperChips/u,
  );

  assert.match(sharedDraftSource, /preserveHelperChipsOnSelect = false/u);
  assert.match(
    sharedDraftSource,
    /if \(!preserveHelperChipsOnSelect\) \{\s*dismissDraftHelperChips\(\);\s*\}/u,
  );
});
