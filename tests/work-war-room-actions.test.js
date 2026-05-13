import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Work War Room renders dashboard-projected approval actions', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WarRoomView.tsx'),
    'utf8',
  );

  assert.match(source, /performWorkTaskActionEnvelope/u);
  assert.match(source, /isActionableApprovalAction/u);
  assert.match(source, /nextAction\.kind === 'approve'/u);
  assert.match(source, /nextAction\.kind === 'reject'/u);
  assert.match(source, /nextActions=\{item\.nextActions\}/u);
  assert.match(source, /WORK_DASHBOARD_QUERY_KEY/u);
  assert.match(source, /TASKS_QUERY_KEY/u);
  assert.match(source, /WORK_GRAPH_QUERY_KEY/u);
});
