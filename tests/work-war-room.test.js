import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('work renderer dashboard api keeps war-room payloads typed', async () => {
  const dashboardApiSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/api/dashboard.ts'),
    'utf8',
  );
  const workRecordsApiSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/api/workRecords.ts'),
    'utf8',
  );
  const projectQuerySource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/state/queries/projectsQuery.ts'),
    'utf8',
  );
  const taskQuerySource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/state/queries/tasksQuery.ts'),
    'utf8',
  );
  const workItemQuerySource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/state/queries/workItemsQuery.ts'),
    'utf8',
  );

  assert.match(dashboardApiSource, /expectJson<WorkDashboardProjection>/u);
  assert.match(workRecordsApiSource, /Promise<WorkSupervisedRunLaunchProjection>/u);
  assert.match(workRecordsApiSource, /expectJson<WorkSupervisedRunLaunchProjection>/u);
  assert.match(projectQuerySource, /Promise<WorkProjectListProjection>/u);
  assert.match(projectQuerySource, /as WorkProjectListProjection/u);
  assert.match(taskQuerySource, /Promise<WorkTaskListProjection>/u);
  assert.match(taskQuerySource, /as WorkTaskListProjection/u);
  assert.match(workItemQuerySource, /Promise<WorkWorkItemListProjection>/u);
  assert.match(workItemQuerySource, /as WorkWorkItemListProjection/u);
});

test('work war-room surfaces consume typed dashboard contracts without local unknown casts', async () => {
  const warRoomSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/WarRoomView.tsx'),
    'utf8',
  );
  const projectDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/projects/ProjectDetailPage.tsx'),
    'utf8',
  );
  const projectListSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/projects/ProjectsListPage.tsx'),
    'utf8',
  );
  const taskDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/tasks/TaskDetailPage.tsx'),
    'utf8',
  );
  const workTaskListSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/tasks/TasksListPage.tsx'),
    'utf8',
  );
  const workItemListSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/work-items/WorkItemsListPage.tsx'),
    'utf8',
  );
  const workItemDetailSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/work-items/WorkItemDetailPage.tsx'),
    'utf8',
  );

  assert.match(warRoomSource, /useWorkDashboardQuery/u);
  assert.match(warRoomSource, /performWorkTaskActionEnvelope/u);
  assert.match(warRoomSource, /buildChannelPath/u);
  assert.match(warRoomSource, /buildMyCatPath/u);
  assert.match(warRoomSource, /taskContext\.conversationSourceChannelId/u);
  assert.match(warRoomSource, /taskContext\.projectId/u);
  assert.match(warRoomSource, /taskContext\.workItemId/u);
  assert.match(warRoomSource, /listCatActorLinks\(taskContext\.assignedActors\)/u);
  assert.equal(
    warRoomSource.match(/<WorkWarRoomTaskContextActions/gu)?.length,
    3,
  );
  assert.match(warRoomSource, /navigate\(`\/work\/projects\/\$\{encodeURIComponent\(projectId\)\}`\)/u);
  assert.match(warRoomSource, /navigate\(`\/work\/work-items\/\$\{encodeURIComponent\(workItemId\)\}`\)/u);
  assert.match(warRoomSource, /navigate\(`\/work\/tasks\/\$\{encodeURIComponent\(taskId\)\}`\)/u);
  assert.doesNotMatch(warRoomSource, /as unknown as/u);

  assert.match(projectDetailSource, /useProjectsQuery/u);
  assert.match(projectDetailSource, /useWorkGraphQuery/u);
  assert.match(projectDetailSource, /removeWorkProject/u);
  assert.match(projectDetailSource, /unlinkWorkExternalIssue/u);
  assert.match(projectDetailSource, /navigate\(WORK_PROJECTS_PATH\)/u);
  assert.doesNotMatch(projectDetailSource, /as unknown as/u);

  assert.match(projectListSource, /useProjectsQuery/u);
  assert.match(projectListSource, /to=\{project\.id\}/u);
  assert.doesNotMatch(projectListSource, /as unknown as/u);

  assert.match(taskDetailSource, /useTasksQuery/u);
  assert.match(taskDetailSource, /useProjectsQuery/u);
  assert.match(taskDetailSource, /useWorkItemsQuery/u);
  assert.match(taskDetailSource, /useWorkGraphQuery/u);
  assert.match(taskDetailSource, /startWorkTaskSupervisedRun/u);
  assert.match(taskDetailSource, /navigate\(WORK_TASKS_PATH\)/u);
  assert.match(taskDetailSource, /navigate\(buildWorkRunPath\(result\.run\.taskId \?\? result\.task\.id, result\.run\.id\)\)/u);
  assert.doesNotMatch(taskDetailSource, /as unknown as/u);

  assert.match(workTaskListSource, /useTasksQuery/u);
  assert.match(workTaskListSource, /to=\{task\.id\}/u);
  assert.doesNotMatch(workTaskListSource, /as unknown as/u);

  assert.match(workItemListSource, /useWorkItemsQuery/u);
  assert.match(workItemListSource, /to=\{wi\.id\}/u);
  assert.doesNotMatch(workItemListSource, /as unknown as/u);

  assert.match(workItemDetailSource, /useWorkItemsQuery/u);
  assert.match(workItemDetailSource, /useProjectsQuery/u);
  assert.match(workItemDetailSource, /useMissionsQuery/u);
  assert.match(workItemDetailSource, /useWorkGraphQuery/u);
  assert.match(workItemDetailSource, /removeWorkItem/u);
  assert.match(workItemDetailSource, /unlinkWorkExternalIssue/u);
  assert.match(workItemDetailSource, /navigate\(WORK_WORK_ITEMS_PATH\)/u);
  assert.doesNotMatch(workItemDetailSource, /as unknown as/u);
});

test('work sidebar demotes War Room below Broken Links', async () => {
  const sidebarSource = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/Sidebar.tsx'),
    'utf8',
  );

  const brokenLinksIndex = sidebarSource.indexOf("key: 'broken-links'");
  const warRoomIndex = sidebarSource.indexOf("key: 'war-room'");

  assert.ok(brokenLinksIndex >= 0, 'Broken Links sidebar entry should exist');
  assert.ok(warRoomIndex >= 0, 'War Room sidebar entry should exist while pending removal');
  assert.ok(
    brokenLinksIndex < warRoomIndex,
    'War Room should stay below Broken Links until the surface is fully removed',
  );
});
