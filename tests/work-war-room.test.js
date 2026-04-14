import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('work renderer dashboard api keeps war-room payloads typed', async () => {
  const dashboardApiSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/api/dashboard.ts'),
    'utf8',
  );

  assert.match(dashboardApiSource, /expectJson<WorkDashboardProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkTaskDetailProjection>/u);
});

test('work war-room surfaces consume typed dashboard contracts without local unknown casts', async () => {
  const warRoomSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WarRoomView.tsx'),
    'utf8',
  );
  const taskDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/TaskDetailView.tsx'),
    'utf8',
  );

  assert.match(warRoomSource, /fetchWorkDashboard/u);
  assert.match(warRoomSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\)/u);
  assert.doesNotMatch(warRoomSource, /as unknown as/u);

  assert.match(taskDetailSource, /fetchWorkTaskDetail/u);
  assert.match(taskDetailSource, /navigate\('\/work\/war-room'\)/u);
  assert.doesNotMatch(taskDetailSource, /as unknown as/u);
});
