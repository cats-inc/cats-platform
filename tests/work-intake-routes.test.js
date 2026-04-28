import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { routeWorkApi } from '../build/server/products/work/api/index.js';

function createMemoryStore() {
  let state = createDefaultCoreState();
  return {
    readCore() {
      return Promise.resolve(state);
    },
    writeCore(next) {
      state = next;
      return Promise.resolve();
    },
    get current() {
      return state;
    },
  };
}

function createTestServer(store) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const handled = await routeWorkApi({
        request,
        response,
        url,
        method: request.method ?? 'GET',
        dependencies: {
          coreStore: store,
          now: () => new Date('2026-03-29T12:00:00.000Z'),
        },
      });

      if (!handled) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not found' }));
      }
    } catch (err) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: err.message }));
    }
  });
}

async function request(server, method, path, body) {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}${path}`;
  const options = {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(url, options);
  const payload = await response.json();
  return { status: response.status, payload };
}

test('GET /api/work/templates returns template list', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'GET', '/api/work/templates');
  assert.equal(status, 200);
  assert.ok(Array.isArray(payload.templates));
  assert.ok(payload.templates.length > 0);
  assert.equal(payload.templates[0].id, 'software_delivery');
});

test('POST /api/work/intake creates plan from template', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/intake', {
    title: 'Test intake',
    brief: 'Build a new feature',
    desiredOutcome: 'Feature is deployed',
    templateId: 'software_delivery',
  });

  assert.equal(status, 201);
  assert.ok(payload.project);
  assert.equal(payload.project.title, 'Test intake');
  assert.equal(payload.project.status, 'planned');
  assert.equal(payload.planStatus, 'draft');
  assert.ok(Array.isArray(payload.tasks));
  assert.ok(payload.tasks.length > 0);

  // Verify tasks have planning metadata
  const firstTask = payload.tasks[0];
  assert.ok(firstTask.productHint);
  assert.ok(firstTask.strategyHint);
  assert.equal(firstTask.handoff.state, 'pending_review');
  assert.equal(firstTask.handoff.targetProduct, firstTask.productHint ?? 'work');
  assert.match(firstTask.handoff.nextAction, /Review and approve/u);
});

test('POST /api/work/intake validates required fields', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/intake', {
    title: '',
    brief: 'something',
    desiredOutcome: 'something',
    templateId: 'software_delivery',
  });

  assert.equal(status, 400);
  assert.ok(payload.error);
});

test('POST /api/work/intake rejects unknown template', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(server, 'POST', '/api/work/intake', {
    title: 'Test',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'nonexistent_template',
  });

  assert.equal(status, 400);
  assert.equal(payload.error.code, 'template_not_found');
});

test('GET /api/work/intake/:projectId/plan returns plan projection', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  // First create an intake
  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Plan review test',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  assert.equal(create.status, 201);
  const projectId = create.payload.project.id;

  // Then fetch the plan
  const { status, payload } = await request(
    server,
    'GET',
    `/api/work/intake/${projectId}/plan`,
  );
  assert.equal(status, 200);
  assert.equal(payload.project.id, projectId);
  assert.equal(payload.planStatus, 'draft');
  assert.ok(payload.tasks.length > 0);
});

test('PATCH /api/work/intake/:projectId/plan/tasks/:taskId updates draft planning hints', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Patch plan task',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  const projectId = create.payload.project.id;
  const taskId = create.payload.tasks[0].id;

  const { status, payload } = await request(
    server,
    'PATCH',
    `/api/work/intake/${projectId}/plan/tasks/${taskId}`,
    {
      acceptanceCriteria: ' Updated criteria ',
      productHint: 'chat',
      strategyHint: 'react',
    },
  );

  assert.equal(status, 200);
  const updatedTask = payload.tasks.find((task) => task.id === taskId);
  assert.ok(updatedTask);
  assert.equal(updatedTask.acceptanceCriteria, 'Updated criteria');
  assert.equal(updatedTask.productHint, 'chat');
  assert.equal(updatedTask.strategyHint, 'react');
  assert.equal(updatedTask.handoff.targetProduct, 'chat');
  assert.ok(
    store.current.activities.some((activity) =>
      activity.projectId === projectId
      && activity.taskId === taskId
      && /Plan task updated before approval/u.test(activity.message),
    ),
    'should record a plan task update activity',
  );
});

test('PATCH /api/work/intake/:projectId/plan/tasks/:taskId rejects approved plans', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Patch approved plan',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  const projectId = create.payload.project.id;
  const taskId = create.payload.tasks[0].id;

  await request(server, 'POST', `/api/work/intake/${projectId}/approve`);
  const { status, payload } = await request(
    server,
    'PATCH',
    `/api/work/intake/${projectId}/plan/tasks/${taskId}`,
    { productHint: 'work' },
  );

  assert.equal(status, 409);
  assert.equal(payload.error.code, 'plan_not_editable');
});

test('POST /api/work/intake/:projectId/approve preserves edited planning hints', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Approve patched plan',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  const projectId = create.payload.project.id;
  const taskId = create.payload.tasks[0].id;

  await request(
    server,
    'PATCH',
    `/api/work/intake/${projectId}/plan/tasks/${taskId}`,
    {
      acceptanceCriteria: 'Owner-edited acceptance',
      productHint: 'chat',
      strategyHint: 'react',
    },
  );

  const { status, payload } = await request(
    server,
    'POST',
    `/api/work/intake/${projectId}/approve`,
  );

  assert.equal(status, 200);
  const approvedTask = payload.tasks.find((task) => task.id === taskId);
  assert.ok(approvedTask);
  assert.equal(approvedTask.status, 'in_progress');
  assert.equal(approvedTask.acceptanceCriteria, 'Owner-edited acceptance');
  assert.equal(approvedTask.productHint, 'chat');
  assert.equal(approvedTask.strategyHint, 'react');
  assert.equal(approvedTask.handoff.state, 'ready_for_pickup');
  assert.equal(approvedTask.handoff.targetProduct, 'chat');
});

test('POST /api/work/intake/:projectId/approve transitions tasks to in_progress with downstream handoff metadata', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  // Create intake
  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Approval test',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  const projectId = create.payload.project.id;

  // Verify tasks have assignedActorIds and conversationId before approval
  const preCore = store.current;
  const preTasks = preCore.tasks.filter(
    (t) => t.metadata?.workIntake?.projectId === projectId,
  );
  for (const task of preTasks) {
    assert.ok(
      task.assignedActorIds.length > 0,
      `Pre-approval task "${task.title}" should have assigned actors`,
    );
    assert.ok(task.conversationId, `Pre-approval task "${task.title}" should have conversationId`);
  }

  // Approve the plan
  const { status, payload } = await request(
    server,
    'POST',
    `/api/work/intake/${projectId}/approve`,
  );

  assert.equal(status, 200);
  assert.equal(payload.planStatus, 'approved');
  assert.equal(payload.project.status, 'active');

  // All tasks should be approved and transitioned to in_progress
  const postCore = store.current;
  const postTasks = postCore.tasks.filter(
    (t) => t.metadata?.workIntake?.projectId === projectId,
  );
  for (const task of postTasks) {
    assert.equal(task.approval.status, 'approved', `Task "${task.title}" approval should be approved`);
    assert.equal(task.status, 'in_progress', `Task "${task.title}" should be in_progress`);
  }

  // Verify tasks carry correct productHint for downstream products
  const productHints = payload.tasks.map((t) => t.productHint);
  assert.ok(productHints.includes('work'), 'should have work-targeted tasks');
  assert.ok(productHints.includes('code'), 'should have code-targeted tasks');
  assert.ok(
    payload.tasks.some((task) => task.handoff.state === 'active_here' && task.handoff.targetProduct === 'work'),
    'should expose work-targeted tasks as active_here',
  );
  assert.ok(
    payload.tasks.some((task) => task.handoff.state === 'ready_for_pickup' && task.handoff.targetProduct === 'code'),
    'should expose code-targeted tasks as ready_for_pickup',
  );

  // Verify activities record the handoff targets
  const postActivities = postCore.activities.filter(
    (a) => a.projectId === projectId && a.kind === 'approval_decided',
  );
  assert.ok(postActivities.length > 0, 'should have approval activities');
  assert.ok(
    postActivities.some((a) => a.message.includes('→ work')),
    'should have activity mentioning work handoff',
  );
  assert.ok(
    postActivities.some((a) => a.message.includes('→ code')),
    'should have activity mentioning code handoff',
  );
});

test('POST /api/work/intake/:projectId/reject transitions tasks to cancelled and project to paused', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  // Create intake
  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Rejection test',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  const projectId = create.payload.project.id;

  // Reject the plan
  const { status, payload } = await request(
    server,
    'POST',
    `/api/work/intake/${projectId}/reject`,
    { notes: 'Scope too broad' },
  );

  assert.equal(status, 200);
  assert.equal(payload.planStatus, 'rejected');
  assert.equal(payload.project.status, 'paused', 'project should be paused after reject');

  // Verify tasks are cancelled, not stuck in pending_approval
  const core = store.current;
  const tasks = core.tasks.filter(
    (t) => t.metadata?.workIntake?.projectId === projectId,
  );
  for (const task of tasks) {
    assert.equal(task.status, 'cancelled', `Task "${task.title}" should be cancelled`);
    assert.equal(task.approval.status, 'rejected', `Task "${task.title}" approval should be rejected`);
  }
  for (const task of payload.tasks) {
    assert.equal(task.handoff.state, 'stopped', `Task "${task.title}" handoff should be stopped`);
  }
});

test('rejected plans do not appear in pendingPlans dashboard section', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  // Create and reject an intake
  const create = await request(server, 'POST', '/api/work/intake', {
    title: 'Rejected plan',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });
  await request(
    server,
    'POST',
    `/api/work/intake/${create.payload.project.id}/reject`,
    { notes: 'No good' },
  );

  // Dashboard should not show it in pendingPlans
  const { payload } = await request(server, 'GET', '/api/work');
  assert.equal(
    payload.sections.pendingPlans.items.length,
    0,
    'pendingPlans should be empty after rejection',
  );
});

test('GET /api/work dashboard includes intake and pendingPlans sections', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  // Create an intake
  await request(server, 'POST', '/api/work/intake', {
    title: 'Dashboard test',
    brief: 'Brief',
    desiredOutcome: 'Outcome',
    templateId: 'software_delivery',
  });

  // Fetch dashboard
  const { status, payload } = await request(server, 'GET', '/api/work');
  assert.equal(status, 200);

  assert.ok(payload.sections.intake, 'dashboard should have intake section');
  assert.ok(payload.sections.pendingPlans, 'dashboard should have pendingPlans section');
  assert.ok(payload.sections.intake.items.length > 0, 'intake should have items');
  assert.ok(payload.sections.pendingPlans.items.length > 0, 'pendingPlans should have items');
});

test('GET /api/work/intake/:projectId/plan returns 404 for unknown project', async (t) => {
  const store = createMemoryStore();
  const server = createTestServer(store);

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status } = await request(
    server,
    'GET',
    '/api/work/intake/nonexistent/plan',
  );
  assert.equal(status, 404);
});
