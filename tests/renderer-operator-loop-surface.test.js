import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('ChatView keeps operator loop surfaces inside the chat side panel workspace', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/components/ChatView.tsx'),
    'utf8',
  );

  assert.match(source, /ApprovalQueuePanel/u);
  assert.match(source, /ProgressSummaryPanel/u);
  assert.match(source, /ActivityFeed/u);
  assert.match(source, /RunInspector/u);
  assert.match(source, /SidePanel/u);
  assert.match(source, /title="Chat Setup"/u);
  assert.match(source, /id: 'operator'/u);
  assert.match(source, /operatorSnapshot/u);
  assert.match(source, /onOperatorAction/u);
  assert.match(source, /effectivePolicy/u);
  assert.match(source, /incidentActions/u);
  assert.match(source, /useMemo\(\s*\(\) => buildChatOperatorView/u);
  assert.match(source, /useMemo\(\s*\(\) => buildRunInspectorView/u);
});
