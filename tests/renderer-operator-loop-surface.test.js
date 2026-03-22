import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('ChatView keeps operator loop surfaces transcript-adjacent', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/components/ChatView.tsx'),
    'utf8',
  );

  assert.match(source, /ApprovalQueuePanel/u);
  assert.match(source, /ProgressSummaryPanel/u);
  assert.match(source, /ActivityFeed/u);
  assert.match(source, /RunInspector/u);
  assert.match(source, /operatorRail/u);
  assert.match(source, /operatorSnapshot/u);
});
