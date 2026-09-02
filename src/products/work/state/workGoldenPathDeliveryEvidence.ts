/**
 * Acceptance-evidence collection for the golden path (SPEC-114 FR-31, FR-39).
 *
 * This is where a model's account of its own work stops mattering. Everything
 * returned here is something Cats caused and observed through the runtime
 * delivery API: a commit that actually landed, a worktree that is actually
 * clean afterwards, artifacts the session actually registered.
 *
 * The one thing Cats cannot verify mechanically is a free-text acceptance
 * criterion. Those stay *claims*, carried separately, so the result message can
 * show what was verified and what was merely asserted.
 */

import type {
  RuntimeDeliveryClient,
  RuntimeRepoSnapshot,
} from '../../../platform/runtime/deliveryClient.js';
import type { WorkCommitEvidence } from './workCompletionEvidence.js';
import type { WorkGoldenPathArtifactEvidence } from './workGoldenPathRunner.js';
import type { WorkGoldenPathEvidenceCollector } from './workGoldenPathRuntimeExecutor.js';

/**
 * The post-commit check Cats performs itself.
 *
 * Named for exactly what it verifies. It proves the commit captured the work
 * and left nothing behind; it does not claim the change is *correct*, and the
 * label must not imply otherwise.
 */
const POST_COMMIT_CHECK = 'runtime repo status: worktree clean at the new HEAD';

export interface CreateRuntimeEvidenceCollectorInput {
  deliveryClient: RuntimeDeliveryClient;
}

function buildCommitMessage(context: { goal: string }): string {
  // Conventional Commits, per the repository convention. Bounded so a long goal
  // cannot produce an unreadable subject line.
  const subject = context.goal.trim().replace(/\s+/gu, ' ').slice(0, 68);
  return `feat: ${subject}`;
}

function hasPendingChanges(snapshot: RuntimeRepoSnapshot): boolean {
  if (snapshot.clean === false) {
    return true;
  }
  return snapshot.stagedCount + snapshot.modifiedCount + snapshot.untrackedCount > 0;
}

/**
 * Collects `commit_only` evidence.
 *
 * Returns nothing when the agent has not changed anything, which is what makes
 * an idle run loop and then fail honestly instead of committing an empty tree
 * and calling it delivery.
 */
async function collectCommitEvidence(input: {
  deliveryClient: RuntimeDeliveryClient;
  workspacePath: string;
  sessionId: string;
  goal: string;
}): Promise<WorkCommitEvidence | null> {
  const before = await input.deliveryClient.inspectRepo({
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
  });
  if (!before.supported || !before.repository) {
    return null;
  }
  if (!hasPendingChanges(before)) {
    return null;
  }

  const changeSummary = [
    `${before.stagedCount} staged`,
    `${before.modifiedCount} modified`,
    `${before.untrackedCount} untracked`,
  ].join(', ');

  const commit = await input.deliveryClient.createCommit({
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
    message: buildCommitMessage({ goal: input.goal }),
  });
  if (commit.state !== 'completed' || commit.commitId === null) {
    return null;
  }

  // Verify the post-condition rather than trusting the commit response: the
  // worktree must be clean and HEAD must have moved.
  const after = await input.deliveryClient.inspectRepo({
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
  });
  const landed = !hasPendingChanges(after) && after.headOid !== before.headOid;

  return {
    commitId: commit.commitId,
    changeSummary,
    validation: { command: POST_COMMIT_CHECK, passed: landed },
  };
}

async function collectArtifactEvidence(input: {
  deliveryClient: RuntimeDeliveryClient;
  workspacePath: string | null;
  sessionId: string;
}): Promise<WorkGoldenPathArtifactEvidence | null> {
  const artifacts = await input.deliveryClient.previewArtifacts({
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
  });
  const first = artifacts[0];
  if (first === undefined) {
    return null;
  }
  return {
    title: first.label ?? first.id,
    path: first.path,
    mimeType: first.mediaType,
  };
}

/**
 * The evidence collector the runtime executor plugs into.
 *
 * A collection failure is deliberately swallowed into "no evidence": the run
 * then continues or ends unmet, which is safer than treating an unreachable
 * delivery endpoint as proof of delivery.
 */
export function createRuntimeEvidenceCollector(
  input: CreateRuntimeEvidenceCollectorInput,
): WorkGoldenPathEvidenceCollector {
  return async ({
    sessionId,
    goal,
    deliveryMode,
    workspacePath,
    acceptanceCriteria,
    claimedCriteria,
  }) => {
    // Only criteria the proposal actually stated can be claimed; an agent
    // cannot invent a criterion and then satisfy it.
    const satisfiedCriteria = acceptanceCriteria.filter((criterion) =>
      claimedCriteria.some(
        (entry) => entry.trim().toLowerCase() === criterion.trim().toLowerCase(),
      ));

    try {
      if (deliveryMode === 'commit_only') {
        if (workspacePath === null) {
          return { satisfiedCriteria, artifact: null, commit: null };
        }
        return {
          satisfiedCriteria,
          artifact: null,
          commit: await collectCommitEvidence({
            deliveryClient: input.deliveryClient,
            workspacePath,
            sessionId,
            goal,
          }),
        };
      }
      return {
        satisfiedCriteria,
        artifact: await collectArtifactEvidence({
          deliveryClient: input.deliveryClient,
          workspacePath,
          sessionId,
        }),
        commit: null,
      };
    } catch {
      return { satisfiedCriteria, artifact: null, commit: null };
    }
  };
}

/**
 * Parses the bounded claim lines the opening instruction asks for.
 *
 * Deliberately strict: an unparsed response yields no claims, so a run
 * continues rather than completing on prose that merely sounds finished.
 */
export function parseClaimedCriteria(responseText: string): string[] {
  const claims: string[] = [];
  for (const line of responseText.split('\n')) {
    const match = /^\s*CRITERIA-MET:\s*(.+?)\s*$/u.exec(line);
    if (match) {
      claims.push(match[1]);
    }
  }
  return claims;
}
