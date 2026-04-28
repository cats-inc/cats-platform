import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorkProjectPath,
  buildWorkTaskPath,
  buildWorkWorkItemPath,
  isWorkProjectsPath,
  isWorkTasksPath,
  isWorkWarRoomPath,
  isWorkWorkItemsPath,
  WORK_PROJECTS_PATH,
  WORK_ROUTE_PREFIX,
  WORK_TASKS_PATH,
  WORK_WAR_ROOM_PATH,
  WORK_WORK_ITEMS_PATH,
} from '../src/products/work/renderer/workPaths.ts';

test('work route helpers build stable list and detail paths', () => {
  assert.equal(WORK_ROUTE_PREFIX, '/work');
  assert.equal(WORK_WAR_ROOM_PATH, '/work/war-room');
  assert.equal(WORK_PROJECTS_PATH, '/work/projects');
  assert.equal(WORK_TASKS_PATH, '/work/tasks');
  assert.equal(WORK_WORK_ITEMS_PATH, '/work/work-items');
  assert.equal(buildWorkProjectPath(), '/work/projects');
  assert.equal(buildWorkProjectPath('project/1'), '/work/projects/project%2F1');
  assert.equal(buildWorkTaskPath(), '/work/tasks');
  assert.equal(buildWorkTaskPath('task/1'), '/work/tasks/task%2F1');
  assert.equal(buildWorkWorkItemPath(), '/work/work-items');
  assert.equal(buildWorkWorkItemPath('item/1'), '/work/work-items/item%2F1');
});

test('work route helpers identify active sections from the current pathname', () => {
  assert.equal(isWorkWarRoomPath('/work/war-room'), true);
  assert.equal(isWorkWarRoomPath('/work/war-room/briefing'), true);
  assert.equal(isWorkWarRoomPath('/work/tasks'), false);
  assert.equal(isWorkTasksPath('/work/tasks'), true);
  assert.equal(isWorkTasksPath('/work/tasks/task-1'), true);
  assert.equal(isWorkTasksPath('/work/tasking'), false);
  assert.equal(isWorkProjectsPath('/work/projects'), true);
  assert.equal(isWorkProjectsPath('/work/projects/project-1'), true);
  assert.equal(isWorkProjectsPath('/work/war-room'), false);
  assert.equal(isWorkWorkItemsPath('/work/work-items'), true);
  assert.equal(isWorkWorkItemsPath('/work/work-items/item-1'), true);
  assert.equal(isWorkWorkItemsPath('/work/work'), false);
});
