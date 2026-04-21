import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoBranchAttachmentOverrides,
  createDraftLeadContext,
  resolveBranch,
  resolveBranchAttachments,
  resolveBranchAudienceKeys,
  resolveBranchCwd,
  resolveBranchSessionPolicy,
  resolveBranchWorkflowShape,
  type DraftLeadContext,
} from '../src/products/shared/renderer/draftBranchResolution.ts';
import type { DraftParallelTarget } from '../src/products/shared/renderer/draftChatUtils.tsx';

const leadPolicy = {
  workspaceKind: 'source',
  workspaceAccess: 'read_write',
  permissionMode: 'skip',
} as const;

const detachedPolicy = {
  workspaceKind: 'worktree',
  workspaceAccess: 'read_only',
  permissionMode: 'default',
} as const;

function createLeadContext(): DraftLeadContext {
  return {
    composerDraft: 'Lead prompt',
    draftCwd: 'C:/repo/main',
    draftRuntimeSessionPolicy: leadPolicy,
    draftAudienceKeys: ['cat:lead', 'cat:lead', 'temp:reviewer'],
    draftWorkflowShape: 'concurrent',
    draftFiles: [new File(['lead'], 'lead.txt')],
  };
}

function createTarget(overrides: Partial<DraftParallelTarget> = {}): DraftParallelTarget {
  return {
    provider: 'claude',
    instance: null,
    model: 'claude-opus-4-6',
    modelSelection: null,
    ...overrides,
  };
}

test('createDraftLeadContext normalizes omitted optional lead defaults', () => {
  const files = [new File(['lead'], 'lead.txt')];

  assert.deepEqual(
    createDraftLeadContext({
      composerDraft: 'Lead prompt',
      draftCwd: null,
      draftFiles: files,
    }),
    {
      composerDraft: 'Lead prompt',
      draftCwd: null,
      draftRuntimeSessionPolicy: null,
      draftAudienceKeys: null,
      draftWorkflowShape: 'sequential',
      draftFiles: files,
    },
  );
});

test('branch resolvers inherit lead values for null and undefined overrides', () => {
  const lead = createLeadContext();
  const target = createTarget({
    cwd: null,
    runtimeSessionPolicy: null,
    audienceKeys: null,
    workflowShape: null,
  });

  assert.equal(resolveBranchCwd(target, lead), lead.draftCwd);
  assert.equal(resolveBranchSessionPolicy(target, lead), leadPolicy);
  assert.deepEqual(resolveBranchAudienceKeys(target, lead), ['cat:lead', 'temp:reviewer']);
  assert.equal(resolveBranchWorkflowShape(target, lead), 'concurrent');
  assert.equal(resolveBranchAttachments(target, lead), lead.draftFiles);

  const resolved = resolveBranch(target, lead);
  assert.equal(resolved.effectivePrompt, 'Lead prompt');
  assert.deepEqual(resolved.isDetached, {
    cwd: false,
    sessionPolicy: false,
    audienceKeys: false,
    workflowShape: false,
  });
});

test('branch resolvers use concrete overrides and mark detached dimensions', () => {
  const lead = createLeadContext();
  const target = createTarget({
    cwd: 'C:/repo/worktrees/right',
    runtimeSessionPolicy: detachedPolicy,
    audienceKeys: ['cat:branch'],
    workflowShape: 'sequential',
  });

  const resolved = resolveBranch(target, lead);
  assert.equal(resolved.effectiveCwd, 'C:/repo/worktrees/right');
  assert.equal(resolved.effectiveSessionPolicy, detachedPolicy);
  assert.deepEqual(resolved.effectiveAudienceKeys, ['cat:branch']);
  assert.equal(resolved.effectiveWorkflowShape, 'sequential');
  assert.equal(resolved.effectiveAttachments, lead.draftFiles);
  assert.deepEqual(resolved.isDetached, {
    cwd: true,
    sessionPolicy: true,
    audienceKeys: true,
    workflowShape: true,
  });
});

test('lead branch overrides equal to lead defaults resolve without changing values', () => {
  const lead = createLeadContext();
  const target = createTarget({
    cwd: lead.draftCwd,
    runtimeSessionPolicy: leadPolicy,
    audienceKeys: ['cat:lead', 'temp:reviewer'],
    workflowShape: lead.draftWorkflowShape,
  });

  const resolved = resolveBranch(target, lead);
  assert.equal(resolved.effectiveCwd, lead.draftCwd);
  assert.equal(resolved.effectiveSessionPolicy, leadPolicy);
  assert.deepEqual(resolved.effectiveAudienceKeys, ['cat:lead', 'temp:reviewer']);
  assert.equal(resolved.effectiveWorkflowShape, lead.draftWorkflowShape);
});

test('dispatch guard rejects reserved per-branch attachment overrides', () => {
  assert.throws(
    () => assertNoBranchAttachmentOverrides([
      createTarget(),
      createTarget({
        attachmentsOverride: [{ relativePath: 'branch-only.txt' }],
      }),
    ]),
    /Branch 2: attachments are not yet per-branch; remove the override\./u,
  );

  assert.doesNotThrow(() => assertNoBranchAttachmentOverrides([
    createTarget({ attachmentsOverride: null }),
    createTarget(),
  ]));
});
