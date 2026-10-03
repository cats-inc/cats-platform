import assert from 'node:assert/strict';
import test from 'node:test';

import { readProductConversationViewSource } from './helpers/readProductConversationViewSource.js';

test('ConversationView keeps operator loop surfaces inside the chat side panel workspace', async () => {
  const source = await readProductConversationViewSource('chat');

  assert.match(source, /ApprovalQueuePanel/u);
  assert.match(source, /ProgressSummaryPanel/u);
  assert.match(source, /ActivityFeed/u);
  assert.match(source, /RunInspector/u);
  assert.match(source, /SidePanel/u);
  assert.match(source, /messageKeys\.chatNewChatDraftSidePanelTitle/u);
  assert.match(source, /id: 'operator'/u);
  assert.match(source, /operatorSnapshot/u);
  assert.match(source, /onOperatorAction/u);
  assert.match(source, /effectivePolicy/u);
  assert.match(source, /incidentActions/u);
  assert.match(source, /useMemo\(\s*\(\) => buildChatOperatorView/u);
  assert.match(source, /useMemo\(\s*\(\) => buildRunInspectorView/u);
  assert.match(source, /className="chatPaneSidePanel chatPaneSidePanelBelowBar"/u);
});
