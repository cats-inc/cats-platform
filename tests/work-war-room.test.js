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
  assert.match(dashboardApiSource, /expectJson<WorkProjectDetailProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkWorkItemDetailProjection>/u);
});

test('work war-room surfaces consume typed dashboard contracts without local unknown casts', async () => {
  const warRoomSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WarRoomView.tsx'),
    'utf8',
  );
  const projectDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/ProjectDetailView.tsx'),
    'utf8',
  );
  const taskDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/TaskDetailView.tsx'),
    'utf8',
  );
  const workItemDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WorkItemDetailView.tsx'),
    'utf8',
  );

  assert.match(warRoomSource, /fetchWorkDashboard/u);
  assert.match(warRoomSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(projectId\)\}`\)/u);
  assert.match(warRoomSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(workItemId\)\}`\)/u);
  assert.match(warRoomSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\)/u);
  assert.doesNotMatch(warRoomSource, /as unknown as/u);

  assert.match(projectDetailSource, /fetchWorkProjectDetail/u);
  assert.match(projectDetailSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(workItem\.id\)\}`\)/u);
  assert.match(projectDetailSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(task\.id\)\}`\)/u);
  assert.doesNotMatch(projectDetailSource, /as unknown as/u);

  assert.match(taskDetailSource, /fetchWorkTaskDetail/u);
  assert.match(taskDetailSource, /navigate\('\/work\/war-room'\)/u);
  assert.doesNotMatch(taskDetailSource, /as unknown as/u);

  assert.match(workItemDetailSource, /fetchWorkItemDetail/u);
  assert.match(workItemDetailSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(payload\.project!\.id\)\}`\)/u);
  assert.match(workItemDetailSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(payload\.linkedTask!\.task\.id\)\}`\)/u);
  assert.doesNotMatch(workItemDetailSource, /as unknown as/u);
});
