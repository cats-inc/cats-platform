import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorkApiProjectPath,
  buildWorkApiTaskPath,
  buildWorkApiTaskSupervisedRunPath,
  buildWorkApiWorkItemPath,
  WORK_API_PREFIX,
  WORK_API_PROJECT_DETAIL_PATH_TEMPLATE,
  WORK_API_PROJECTS_PATH,
  WORK_API_TASK_DETAIL_PATH_TEMPLATE,
  WORK_API_TASK_SUPERVISED_RUN_PATH_TEMPLATE,
  WORK_API_TASKS_PATH,
  WORK_API_WAR_ROOM_PATH,
  WORK_API_WORK_ITEM_DETAIL_PATH_TEMPLATE,
  WORK_API_WORK_ITEMS_PATH,
} from '../src/products/work/shared/apiPaths.ts';

test('work api path helpers build stable collection and detail paths', () => {
  assert.equal(WORK_API_PREFIX, '/api/work');
  assert.equal(WORK_API_PROJECTS_PATH, '/api/work/projects');
  assert.equal(WORK_API_TASKS_PATH, '/api/work/tasks');
  assert.equal(WORK_API_WORK_ITEMS_PATH, '/api/work/work-items');
  assert.equal(WORK_API_WAR_ROOM_PATH, '/api/work/war-room');
  assert.equal(WORK_API_PROJECT_DETAIL_PATH_TEMPLATE, '/api/work/projects/:projectId');
  assert.equal(WORK_API_TASK_DETAIL_PATH_TEMPLATE, '/api/work/tasks/:taskId');
  assert.equal(
    WORK_API_TASK_SUPERVISED_RUN_PATH_TEMPLATE,
    '/api/work/tasks/:taskId/supervised-run',
  );
  assert.equal(WORK_API_WORK_ITEM_DETAIL_PATH_TEMPLATE, '/api/work/work-items/:workItemId');
  assert.equal(buildWorkApiProjectPath(), '/api/work/projects');
  assert.equal(buildWorkApiProjectPath('project/1'), '/api/work/projects/project%2F1');
  assert.equal(buildWorkApiTaskPath(), '/api/work/tasks');
  assert.equal(buildWorkApiTaskPath('task/1'), '/api/work/tasks/task%2F1');
  assert.equal(
    buildWorkApiTaskSupervisedRunPath('task/1'),
    '/api/work/tasks/task%2F1/supervised-run',
  );
  assert.equal(buildWorkApiWorkItemPath(), '/api/work/work-items');
  assert.equal(buildWorkApiWorkItemPath('item/1'), '/api/work/work-items/item%2F1');
});
