import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCodeApiArtifactPath,
  buildCodeApiCodespacePath,
  buildCodeApiRelayFanOutPath,
  buildCodeApiRelayRosterEntryPath,
  buildCodeApiRuntimeSessionObservePath,
  buildCodeApiTaskExecutePath,
  buildCodeApiTaskPath,
  buildCodeApiTaskPlanPath,
  buildCodeApiTaskPlanStepPath,
  buildCodeApiTaskResumePath,
  CODE_API_ARTIFACT_DETAIL_PATH_TEMPLATE,
  CODE_API_ARTIFACTS_PATH,
  CODE_API_BUILDS_PATH,
  CODE_API_CODESPACE_DETAIL_PATH_TEMPLATE,
  CODE_API_CODESPACE_RESOLVE_PATH,
  CODE_API_CODESPACES_PATH,
  CODE_API_DELIVERY_ARTIFACT_EXPORT_PATH,
  CODE_API_DELIVERY_REPO_COMMIT_PATH,
  CODE_API_DELIVERY_REPO_PUSH_PATH,
  CODE_API_DELIVERY_REPO_STATUS_PATH,
  CODE_API_PREFIX,
  CODE_API_PREVIEWS_PATH,
  CODE_API_RELAY_FAN_OUT_PATH_TEMPLATE,
  CODE_API_RELAY_ROSTER_ENTRY_PATH_TEMPLATE,
  CODE_API_RELAY_THREADS_PATH,
  CODE_API_RUNTIME_SESSION_OBSERVE_PATH_TEMPLATE,
  CODE_API_TASK_DETAIL_PATH_TEMPLATE,
  CODE_API_TASK_EXECUTE_PATH_TEMPLATE,
  CODE_API_TASK_PLAN_PATH_TEMPLATE,
  CODE_API_TASK_PLAN_STEP_PATH_TEMPLATE,
  CODE_API_TASK_RESUME_PATH_TEMPLATE,
  CODE_API_TASKS_PATH,
} from '../src/products/code/shared/apiPaths.ts';

test('code api path helpers build stable collection and detail paths', () => {
  assert.equal(CODE_API_PREFIX, '/api/code');
  assert.equal(CODE_API_TASKS_PATH, '/api/code/tasks');
  assert.equal(CODE_API_CODESPACES_PATH, '/api/code/codespaces');
  assert.equal(CODE_API_ARTIFACTS_PATH, '/api/code/artifacts');
  assert.equal(CODE_API_BUILDS_PATH, '/api/code/builds');
  assert.equal(CODE_API_PREVIEWS_PATH, '/api/code/previews');
  assert.equal(CODE_API_CODESPACE_RESOLVE_PATH, '/api/code/codespaces/resolve');
  assert.equal(CODE_API_DELIVERY_REPO_STATUS_PATH, '/api/code/delivery/repo/status');
  assert.equal(CODE_API_DELIVERY_REPO_COMMIT_PATH, '/api/code/delivery/repo/commit');
  assert.equal(CODE_API_DELIVERY_REPO_PUSH_PATH, '/api/code/delivery/repo/push');
  assert.equal(CODE_API_DELIVERY_ARTIFACT_EXPORT_PATH, '/api/code/delivery/artifacts/export');
  assert.equal(CODE_API_RELAY_THREADS_PATH, '/api/code/relay/threads');
  assert.equal(CODE_API_TASK_DETAIL_PATH_TEMPLATE, '/api/code/tasks/:taskId');
  assert.equal(CODE_API_TASK_EXECUTE_PATH_TEMPLATE, '/api/code/tasks/:taskId/execute');
  assert.equal(CODE_API_TASK_RESUME_PATH_TEMPLATE, '/api/code/tasks/:taskId/resume');
  assert.equal(CODE_API_TASK_PLAN_PATH_TEMPLATE, '/api/code/tasks/:taskId/plan');
  assert.equal(CODE_API_TASK_PLAN_STEP_PATH_TEMPLATE, '/api/code/tasks/:taskId/plan/steps/:stepId');
  assert.equal(CODE_API_CODESPACE_DETAIL_PATH_TEMPLATE, '/api/code/codespaces/:codespaceId');
  assert.equal(CODE_API_ARTIFACT_DETAIL_PATH_TEMPLATE, '/api/code/artifacts/:artifactId');
  assert.equal(
    CODE_API_RUNTIME_SESSION_OBSERVE_PATH_TEMPLATE,
    '/api/code/runtime/sessions/:sessionId/observe',
  );
  assert.equal(
    CODE_API_RELAY_ROSTER_ENTRY_PATH_TEMPLATE,
    '/api/code/relay/threads/:threadId/roster/:agentId',
  );
  assert.equal(CODE_API_RELAY_FAN_OUT_PATH_TEMPLATE, '/api/code/relay/threads/:threadId/fan-out');
  assert.equal(buildCodeApiTaskPath(), '/api/code/tasks');
  assert.equal(buildCodeApiTaskPath('task/1'), '/api/code/tasks/task%2F1');
  assert.equal(buildCodeApiCodespacePath(), '/api/code/codespaces');
  assert.equal(buildCodeApiCodespacePath('codespace/1'), '/api/code/codespaces/codespace%2F1');
  assert.equal(buildCodeApiTaskExecutePath('task/1'), '/api/code/tasks/task%2F1/execute');
  assert.equal(buildCodeApiTaskResumePath('task/1'), '/api/code/tasks/task%2F1/resume');
  assert.equal(buildCodeApiTaskPlanPath('task/1'), '/api/code/tasks/task%2F1/plan');
  assert.equal(
    buildCodeApiTaskPlanStepPath('task/1', 'step/2'),
    '/api/code/tasks/task%2F1/plan/steps/step%2F2',
  );
  assert.equal(buildCodeApiArtifactPath(), '/api/code/artifacts');
  assert.equal(buildCodeApiArtifactPath('artifact/1'), '/api/code/artifacts/artifact%2F1');
  assert.equal(
    buildCodeApiRuntimeSessionObservePath('session/1'),
    '/api/code/runtime/sessions/session%2F1/observe',
  );
  assert.equal(
    buildCodeApiRelayRosterEntryPath('thread/1', 'agent/2'),
    '/api/code/relay/threads/thread%2F1/roster/agent%2F2',
  );
  assert.equal(
    buildCodeApiRelayFanOutPath('thread/1'),
    '/api/code/relay/threads/thread%2F1/fan-out',
  );
});
