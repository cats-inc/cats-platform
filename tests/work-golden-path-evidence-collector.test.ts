/**
 * Acceptance-evidence collection (SPEC-114 FR-31, FR-38, FR-39).
 *
 * These tests exist because this module is the only thing standing between "the
 * model said it committed" and Cats telling an owner that work was delivered.
 * Everything is driven through a fake `cats-runtime` delivery endpoint; no real
 * repository is touched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeDeliveryClient } from '../src/platform/runtime/deliveryClient.js';
import {
  createRuntimeEvidenceCollector,
  parseClaimedCriteria,
} from '../src/products/work/state/workGoldenPathDeliveryEvidence.js';
import { createWorkGoldenPathRuntimeExecutor } from '../src/products/work/state/workGoldenPathRuntimeExecutor.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';

const WORKSPACE = '/tmp/evidence-workspace';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';

interface FakeRuntimeCall {
  path: string;
  body: Record<string, unknown>;
}

/**
 * A fake delivery endpoint.
 *
 * `repoStates` is consumed one entry per `/delivery/repo/status` call so a test
 * can describe "dirty, then clean after the commit" precisely.
 */
function createFakeDeliveryFetch(input: {
  repoStates: Array<Record<string, unknown>>;
  commit?: Record<string, unknown>;
  artifacts?: unknown[];
  failWith?: number;
}): { fetchImpl: typeof fetch; calls: FakeRuntimeCall[] } {
  const calls: FakeRuntimeCall[] = [];
  let statusIndex = 0;

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/u, '');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ path, body });

    if (input.failWith !== undefined) {
      return {
        ok: false,
        status: input.failWith,
        statusText: 'Server Error',
        text: async () => 'boom',
      } as unknown as Response;
    }

    const payload = (() => {
      if (path === '/delivery/repo/status') {
        const state = input.repoStates[Math.min(statusIndex, input.repoStates.length - 1)];
        statusIndex += 1;
        return { state: 'completed', repo: state };
      }
      if (path === '/delivery/repo/commit') {
        return input.commit ?? { state: 'blocked', blockedReasons: [] };
      }
      return { state: 'ready', artifacts: input.artifacts ?? [] };
    })();

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function collector(input: Parameters<typeof createFakeDeliveryFetch>[0]) {
  const { fetchImpl, calls } = createFakeDeliveryFetch(input);
  return {
    calls,
    collect: createRuntimeEvidenceCollector({
      deliveryClient: createRuntimeDeliveryClient({
        baseUrl: 'http://127.0.0.1:3110',
        fetchImpl,
      }),
    }),
  };
}

const STAGED = {
  supported: true,
  repository: true,
  clean: false,
  headOid: 'aaaaaaaaaaaa',
  stagedCount: 2,
  modifiedCount: 0,
  untrackedCount: 0,
};
const CLEAN_AFTER = {
  supported: true,
  repository: true,
  clean: true,
  headOid: 'bbbbbbbbbbbb',
  stagedCount: 0,
  modifiedCount: 0,
  untrackedCount: 0,
};

const BASE_INPUT = {
  runId: 'run-1',
  sessionId: 'session-1',
  goal: 'Add a changelog entry for 0.1.21',
  deliveryMode: 'commit_only' as const,
  workspacePath: WORKSPACE,
  deliveryWorkspacePath: '/tmp/runtime-worktree',
  baselineHeadOid: 'aaaaaaaaaaaa',
  acceptanceCriteria: [CRITERION],
  claimedCriteria: [CRITERION],
};

// --- commit_only --------------------------------------------------------------

test('a real commit produces a verified commit id and post-commit check', async () => {
  const { collect, calls } = collector({
    repoStates: [STAGED, CLEAN_AFTER],
    commit: { state: 'completed', metadata: { commit: { oid: 'bbbbbbbbbbbb' } } },
  });

  const evidence = await collect(BASE_INPUT);

  assert.equal(evidence.commit?.commitId, 'bbbbbbbbbbbb');
  assert.equal(evidence.commit?.changeSummary, '2 staged, 0 modified, 0 untracked');
  assert.equal(evidence.commit?.validation?.passed, true);
  assert.equal(evidence.commit?.deliveryWorkspacePath, '/tmp/runtime-worktree');
  assert.equal(evidence.commit?.deliverySessionId, 'session-1');
  assert.match(evidence.commit?.validation?.command ?? '', /worktree clean at the new HEAD/u);
  assert.deepEqual(evidence.satisfiedCriteria, [CRITERION]);

  // Status is checked before *and* after: the post-condition is verified, not
  // taken from the commit response.
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/delivery/repo/status', '/delivery/repo/commit', '/delivery/repo/status'],
  );
  assert.equal(calls[1].body.apply, true);
  assert.equal(calls[1].body.actorRole, 'owner');
  assert.equal(calls[1].body.approved, true);
  const repo = calls[1].body.repo as Record<string, unknown>;
  assert.match(String(repo.message), /^feat: /u);
  assert.equal(repo.stageAll, true);
  assert.equal(calls[0].body.workspacePath, undefined);
  assert.equal(calls[0].body.sessionId, 'session-1');
});

test('an idle agent produces no commit evidence rather than an empty commit', async () => {
  const { collect, calls } = collector({ repoStates: [CLEAN_AFTER] });

  const evidence = await collect(BASE_INPUT);

  assert.equal(evidence.commit, null);
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/delivery/repo/status'],
    'a clean worktree must never reach the commit endpoint',
  );
});

test('push modes create local commit evidence before gated publication', async () => {
  const { collect, calls } = collector({
    repoStates: [STAGED, CLEAN_AFTER],
    commit: { state: 'completed', metadata: { commit: { oid: 'bbbbbbbbbbbb' } } },
  });

  const evidence = await collect({ ...BASE_INPUT, deliveryMode: 'push_branch' });

  assert.equal(evidence.artifact, null);
  assert.equal(evidence.commit?.commitId, 'bbbbbbbbbbbb');
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/delivery/repo/status', '/delivery/repo/commit', '/delivery/repo/status'],
  );
});

test('a moved HEAD since admission is not committed', async () => {
  const { collect, calls } = collector({
    repoStates: [{ ...STAGED, headOid: 'cccccccccccc' }],
  });

  assert.equal((await collect(BASE_INPUT)).commit, null);
  assert.deepEqual(calls.map((call) => call.path), ['/delivery/repo/status']);
});

test('push authorization fields match the cats-runtime delivery contract', async () => {
  const { fetchImpl, calls } = createFakeDeliveryFetch({ repoStates: [CLEAN_AFTER] });
  const client = createRuntimeDeliveryClient({
    baseUrl: 'http://127.0.0.1:3110',
    fetchImpl,
  });

  await client.pushBranch({
    workspacePath: WORKSPACE,
    sessionId: 'session-1',
    approvalRef: 'approval-1',
  });
  const body = calls[0].body;
  assert.equal(body.actorRole, 'owner');
  assert.equal(body.approved, true);
  assert.deepEqual(body.context, { approvalRef: 'approval-1' });
  assert.equal(body.authorization, undefined);
});

test('a commit that did not land fails its post-commit check', async () => {
  const { collect } = collector({
    // The worktree is still dirty afterwards and HEAD never moved.
    repoStates: [STAGED, STAGED],
    commit: { state: 'completed', metadata: { commit: { oid: 'aaaaaaaaaaaa' } } },
  });

  const evidence = await collect(BASE_INPUT);

  assert.equal(evidence.commit?.validation?.passed, false, 'the check must not pass');
});

test('a blocked commit yields no evidence', async () => {
  const { collect } = collector({
    repoStates: [STAGED, STAGED],
    commit: { state: 'blocked', blockedReasons: [{ code: 'git_commit_failed' }] },
  });

  assert.equal((await collect(BASE_INPUT)).commit, null);
});

test('a non-repository workspace yields no commit evidence', async () => {
  const { collect } = collector({
    repoStates: [{ supported: true, repository: false, clean: null }],
  });

  assert.equal((await collect(BASE_INPUT)).commit, null);
});

test('an unreachable delivery endpoint yields no evidence, never false delivery', async () => {
  const { collect } = collector({ repoStates: [STAGED], failWith: 500 });

  const evidence = await collect(BASE_INPUT);

  assert.equal(evidence.commit, null);
  assert.equal(evidence.artifact, null);
});

// --- artifact_only ------------------------------------------------------------

test('artifact_only reads the session artifacts without publishing them (FR-38)', async () => {
  const { collect, calls } = collector({
    repoStates: [CLEAN_AFTER],
    artifacts: [{ id: 'artifact-1', label: 'Summary', path: '/tmp/out.md', mediaType: 'text/markdown' }],
  });

  const evidence = await collect({ ...BASE_INPUT, deliveryMode: 'artifact_only' });

  assert.deepEqual(evidence.artifact, {
    title: 'Summary',
    path: '/tmp/out.md',
    mimeType: 'text/markdown',
    deliveryWorkspacePath: '/tmp/runtime-worktree',
    deliverySessionId: 'session-1',
  });
  assert.equal(calls[0].path, '/delivery/artifacts/publish');
  assert.equal(calls[0].body.apply, false, 'listing must not publish');
});

test('artifact_only with no artifacts yields no evidence', async () => {
  const { collect } = collector({ repoStates: [CLEAN_AFTER], artifacts: [] });

  assert.equal((await collect({ ...BASE_INPUT, deliveryMode: 'artifact_only' })).artifact, null);
});

// --- Criterion claims ---------------------------------------------------------

test('only criteria the proposal stated can be claimed', async () => {
  const { collect } = collector({ repoStates: [CLEAN_AFTER] });

  const evidence = await collect({
    ...BASE_INPUT,
    claimedCriteria: ['Something the owner never asked for', CRITERION.toUpperCase()],
  });

  assert.deepEqual(
    evidence.satisfiedCriteria,
    [CRITERION],
    'an invented criterion is discarded; a case-different match is accepted',
  );
});

test('claim parsing is strict, so confident prose alone claims nothing', () => {
  assert.deepEqual(parseClaimedCriteria('I have finished the task. Everything works.'), []);
  assert.deepEqual(
    parseClaimedCriteria(`Did the work.\nCRITERIA-MET: ${CRITERION}\n`),
    [CRITERION],
  );
  assert.deepEqual(
    parseClaimedCriteria(`CRITERIA-MET: one\nnoise\n  CRITERIA-MET:   two  `),
    ['one', 'two'],
  );
});

// --- Executor integration -----------------------------------------------------

test('the executor parses claims from its own turn and passes them to the collector', async () => {
  const seen: Array<readonly string[]> = [];
  const runtimeClient = {
    createSession: async () => ({ id: 'session-1', provider: 'claude', model: 'opus' }),
    sendMessage: async () => ({
      segments: [{ kind: 'text', text: `Done.\nCRITERIA-MET: ${CRITERION}` }],
      inputTokens: 1,
      outputTokens: 1,
      tokensUsed: 2,
    }),
  } as unknown as RuntimeClient;

  const executor = createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
    collectEvidence: async ({ claimedCriteria }) => {
      seen.push(claimedCriteria);
      return { satisfiedCriteria: claimedCriteria, artifact: null, commit: null };
    },
  });

  const result = await executor({
    runId: 'run-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    stepIndex: 0,
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    workspacePath: WORKSPACE,
    outstandingGaps: [],
    outstandingCriteria: [],
  });

  assert.deepEqual(seen, [[CRITERION]]);
  assert.deepEqual(result.satisfiedCriteria, [CRITERION]);
});

test('the executor asks for the bounded claim format instead of free prose', async () => {
  const messages: string[] = [];
  const sessionInputs: Record<string, unknown>[] = [];
  const runtimeClient = {
    createSession: async (input: Record<string, unknown>) => {
      sessionInputs.push(input);
      return { id: 'session-1', provider: 'claude', model: 'opus' };
    },
    sendMessage: async (_id: string, content: string) => {
      messages.push(content);
      return { segments: [], inputTokens: 0, outputTokens: 0, tokensUsed: 0 };
    },
  } as unknown as RuntimeClient;

  const executor = createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => ({ provider: 'claude', model: 'opus' }),
  });

  await executor({
    runId: 'run-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    stepIndex: 0,
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    workspacePath: WORKSPACE,
    outstandingGaps: [],
    outstandingCriteria: [],
  });

  assert.ok(messages[0].includes('CRITERIA-MET:'));
  assert.ok(messages[0].includes('Do not declare the task complete'));
  const sessionInput = sessionInputs[0];
  assert.equal(sessionInput?.workspaceKind, 'worktree');
  assert.equal(sessionInput?.workspaceAccess, 'read_write');
  assert.equal(sessionInput?.permissionMode, 'whitelist');
  const allowedTools = sessionInput?.allowedTools as string[];
  assert.ok(allowedTools.includes('Read'));
  assert.ok(allowedTools.includes('apply_patch'));
  assert.ok(!allowedTools.includes('Bash'));
  assert.ok(!allowedTools.includes('git'));
});

test('a run with no resolvable provider fails instead of opening a session', async () => {
  const runtimeClient = {
    createSession: async () => {
      throw new Error('should not be called');
    },
  } as unknown as RuntimeClient;

  const executor = createWorkGoldenPathRuntimeExecutor({
    runtimeClient,
    resolveTarget: () => null,
  });

  const result = await executor({
    runId: 'run-1',
    taskId: null,
    workItemId: 'work-item-1',
    stepIndex: 0,
    goal: 'Add a changelog entry',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    workspacePath: null,
    outstandingGaps: [],
    outstandingCriteria: [],
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.blockedReason, 'execution_target_missing');
});
