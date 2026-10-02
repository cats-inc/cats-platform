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
    path.join(process.cwd(), 'src', 'products', 'shared', 'renderer', 'components', 'NewConversationDraft.tsx'),
    'utf8',
  );

  assert.match(codeDraftSource, /preserveOnSelect:\s*true/u);
  assert.match(codeDraftSource, /starterChips=\{\{[\s\S]*helperChips\.map/u);
  assert.match(
    codeDraftSource,
    /onClick:\s*buildCodeChipOnClick\(chip,\s*props\)/u,
  );
  // ADR-129 retired the direct-lane draft, the only `onSelectHelperChip`
  // path; every Code draft now goes through starterChips.
  assert.doesNotMatch(codeDraftSource, /onSelectHelperChip/u);
  assert.match(
    codeDraftSource,
    /props\.onComposerChange\(chip\.prompt\);[\s\S]*props\.onDraftSurfaceChange\(target\);/u,
  );
  assert.doesNotMatch(
    codeDraftSource,
    /buildCodeChipOnClick[\s\S]*dismissDraftHelperChips/u,
  );

  assert.match(sharedDraftSource, /preserveOnSelect \?\? false/u);
  assert.match(
    sharedDraftSource,
    /if \(!preserveHelperChipsOnSelect\) \{\s*dismissDraftHelperChips\(\);\s*\}/u,
  );
});
