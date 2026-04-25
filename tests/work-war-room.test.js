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
  assert.match(dashboardApiSource, /expectJson<WorkSupervisedRunLaunchProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkProjectListProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkTaskListProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkTaskDetailProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkProjectDetailProjection>/u);
  assert.match(dashboardApiSource, /expectJson<WorkWorkItemListProjection>/u);
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
  const projectListSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/ProjectListView.tsx'),
    'utf8',
  );
  const taskDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/TaskDetailView.tsx'),
    'utf8',
  );
  const workTaskListSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WorkTaskListView.tsx'),
    'utf8',
  );
  const workItemListSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WorkItemListView.tsx'),
    'utf8',
  );
  const workItemDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WorkItemDetailView.tsx'),
    'utf8',
  );

  assert.match(warRoomSource, /fetchWorkDashboard/u);
  assert.match(warRoomSource, /buildChannelPath/u);
  assert.match(warRoomSource, /buildMyCatPath/u);
  assert.match(warRoomSource, /taskContext\.conversationSourceChannelId/u);
  assert.match(warRoomSource, /taskContext\.projectId/u);
  assert.match(warRoomSource, /taskContext\.workItemId/u);
  assert.match(warRoomSource, /listCatActorLinks\(taskContext\.assignedActors\)/u);
  assert.equal(
    warRoomSource.match(
      /<WorkWarRoomTaskContextActions taskId=\{item\.taskId\} taskContext=\{item\.taskContext\} \/>/gu,
    )?.length,
    3,
  );
  assert.match(warRoomSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(projectId\)\}`\)/u);
  assert.match(warRoomSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(workItemId\)\}`\)/u);
  assert.match(warRoomSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\)/u);
  assert.doesNotMatch(warRoomSource, /as unknown as/u);

  assert.match(projectDetailSource, /fetchWorkProjectDetail/u);
  assert.match(projectDetailSource, /buildChannelPath/u);
  assert.match(projectDetailSource, /buildMyCatPath/u);
  assert.match(projectDetailSource, /navigate\(buildWorkProjectPath\(\)\)/u);
  assert.match(projectDetailSource, /task\.conversationSourceChannelId/u);
  assert.match(projectDetailSource, /listCatActorLinks\(task\.assignedActors\)/u);
  assert.match(projectDetailSource, /navigate\(buildWorkWorkItemPath\(workItem\.id\)\)/u);
  assert.match(projectDetailSource, /navigate\(buildWorkTaskPath\(task\.id\)\)/u);
  assert.doesNotMatch(projectDetailSource, /as unknown as/u);

  assert.match(projectListSource, /fetchWorkProjectList/u);
  assert.match(projectListSource, /buildChannelPath/u);
  assert.match(projectListSource, /navigate\(buildWorkProjectPath\(project\.id\)\)/u);
  assert.doesNotMatch(projectListSource, /as unknown as/u);

  assert.match(taskDetailSource, /fetchWorkTaskDetail/u);
  assert.match(taskDetailSource, /startWorkSupervisedRun/u);
  assert.match(taskDetailSource, /buildChannelPath/u);
  assert.match(taskDetailSource, /buildMyCatPath/u);
  assert.match(taskDetailSource, /navigate\('\/work\/tasks'\)/u);
  assert.match(taskDetailSource, /handleStartSupervisedRun/u);
  assert.match(taskDetailSource, /payload\.supervision/u);
  assert.match(taskDetailSource, /formatSupervisionBlockers/u);
  assert.match(taskDetailSource, /formatSupervisionApprovals/u);
  assert.match(taskDetailSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(payload\.project!\.id\)\}`\)/u);
  assert.match(taskDetailSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(payload\.workItem!\.id\)\}`\)/u);
  assert.doesNotMatch(taskDetailSource, /as unknown as/u);

  assert.match(workTaskListSource, /fetchWorkTaskList/u);
  assert.match(workTaskListSource, /buildChannelPath/u);
  assert.match(workTaskListSource, /buildMyCatPath/u);
  assert.match(workTaskListSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(task\.id\)\}`\)/u);
  assert.match(workTaskListSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(task\.projectId!\)\}`\)/u);
  assert.match(workTaskListSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(task\.workItemId!\)\}`\)/u);
  assert.doesNotMatch(workTaskListSource, /as unknown as/u);

  assert.match(workItemListSource, /fetchWorkItemList/u);
  assert.match(workItemListSource, /buildChannelPath/u);
  assert.match(workItemListSource, /buildMyCatPath/u);
  assert.match(workItemListSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(workItem\.id\)\}`\)/u);
  assert.match(workItemListSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(workItem\.taskId!\)\}`\)/u);
  assert.doesNotMatch(workItemListSource, /as unknown as/u);

  assert.match(workItemDetailSource, /fetchWorkItemDetail/u);
  assert.match(workItemDetailSource, /buildChannelPath/u);
  assert.match(workItemDetailSource, /buildMyCatPath/u);
  assert.match(workItemDetailSource, /navigate\('\/work\/work-items'\)/u);
  assert.match(workItemDetailSource, /payload\.linkedTask\.conversation\?\.sourceChannelId/u);
  assert.match(workItemDetailSource, /listCatActorLinks\(payload\.linkedTask\.assignedActors\)/u);
  assert.match(workItemDetailSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(payload\.project!\.id\)\}`\)/u);
  assert.match(workItemDetailSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(payload\.linkedTask!\.task\.id\)\}`\)/u);
  assert.doesNotMatch(workItemDetailSource, /as unknown as/u);
});
