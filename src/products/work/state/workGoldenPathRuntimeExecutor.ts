/**
 * The runtime-backed step executor for the golden path (SPEC-114 FR-28).
 *
 * Execution goes through one supervised `cats-runtime` session for the whole
 * run: step 0 opens it with the goal and acceptance criteria, and every later
 * step continues the same session with what is still missing. A Telegram
 * handler never starts a provider session itself.
 *
 * The executor deliberately never reports completion. It returns
 * `claims_complete` on every successful turn and lets the runner's evidence
 * check decide, which is what keeps FR-30 true no matter what the model says.
 */

import type { CoreDeliveryMode } from '../../../core/types.js';
import type {
  RuntimeClient,
  RuntimeSessionInfo,
} from '../../../platform/runtime/client.js';
import { resolveFullResponseText } from '../../../platform/runtime/client.js';
import {
  createSupervisedRuntimeSession,
  RuntimeSupervisionRejectedError,
  sendSupervisedRuntimeMessage,
} from '../../../platform/supervision/runtimeBoundary.js';
import type { RuntimeSupervisionContext } from '../../../platform/supervision/runtimeBoundary.js';
import type { SupervisionToolScope } from '../../../platform/supervision/contracts.js';
import type { WorkCommitEvidence } from './workCompletionEvidence.js';
import type {
  WorkGoldenPathArtifactEvidence,
  WorkGoldenPathStepContext,
  WorkGoldenPathStepExecutor,
  WorkGoldenPathStepResult,
} from './workGoldenPathRunner.js';
import { parseClaimedCriteria } from './workGoldenPathDeliveryEvidence.js';

/**
 * Turns a finished turn into acceptance evidence.
 *
 * This is the seam the runtime delivery wiring plugs into: `commit_only` needs
 * an immutable commit id from `POST /delivery/repo/commit`, and `artifact_only`
 * needs a materialized Artifact. Until that is wired the default collector
 * returns nothing, and a run honestly reports unmet acceptance rather than
 * completing on the strength of a model's own summary.
 */
export type WorkGoldenPathEvidenceCollector = (input: {
  runId: string;
  sessionId: string;
  goal: string;
  deliveryMode: CoreDeliveryMode;
  workspacePath: string | null;
  /** Resolved cwd of the runtime-owned sandbox/worktree. */
  deliveryWorkspacePath?: string | null;
  /** HEAD captured at admission, before this run was allowed to mutate files. */
  baselineHeadOid: string | null;
  acceptanceCriteria: readonly string[];
  /** Criteria the provider asserted in this turn. Claims, not verdicts. */
  claimedCriteria: readonly string[];
}) => Promise<{
  satisfiedCriteria: readonly string[];
  artifact: WorkGoldenPathArtifactEvidence | null;
  commit: WorkCommitEvidence | null;
}>;

export const noEvidenceCollector: WorkGoldenPathEvidenceCollector = async () => ({
  satisfiedCriteria: [],
  artifact: null,
  commit: null,
});

export interface WorkGoldenPathRuntimeTarget {
  provider: string;
  instance?: string | null;
  model?: string | null;
}

export interface CreateWorkGoldenPathRuntimeExecutorInput {
  runtimeClient: RuntimeClient;
  /**
   * The permission envelope this run may execute under.
   *
   * Resolved late, like the target. Passing it is what allows the supervision
   * boundary to refuse an under-permissioned run with `E_TOOL_SCOPE_DENIED`
   * rather than letting it reach the provider and fail somewhere less legible.
   */
  resolveToolScope?: (context: WorkGoldenPathStepContext) => SupervisionToolScope;
  /**
   * Resolved when a session is opened, not when the executor is built.
   *
   * The executor must be constructed once per host so its session map survives
   * across steps, but the bound Cat's provider can change between runs, so the
   * target has to be read late.
   */
  resolveTarget?: (context: WorkGoldenPathStepContext) => WorkGoldenPathRuntimeTarget | null;
  collectEvidence?: WorkGoldenPathEvidenceCollector;
  /** Actor the supervised runtime calls are attributed to. */
  actorRef?: string;
}

const DEFAULT_ACTOR_REF = 'actor-work-golden-path';

/**
 * Provider-independent spellings used by cats-runtime adapters for local file
 * inspection and mutation. Shell, git, network, browser, MCP, and delegation
 * tools are deliberately absent; Cats owns commit/publish side effects.
 */
const GOLDEN_PATH_LOCAL_FILE_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'read_file',
  'list_dir',
  'search',
  'edit',
  'write',
  'fileChange',
  'file_change',
  'apply_patch',
] as const;

/**
 * Rejection codes that mean "the envelope is too narrow", as opposed to "the
 * call went wrong". Budget exhaustion and approval gates are deliberately not
 * here: they are different conversations with the owner.
 */
const PERMISSION_REJECTION_CODES: ReadonlySet<string> = new Set([
  'E_TOOL_SCOPE_DENIED',
  'E_NOT_AUTHORIZED',
]);

/**
 * Every runtime call is made through the supervision boundary rather than the
 * raw client, so budget, policy scope, and tool evidence apply to a golden-path
 * run exactly as they do to any other supervised work.
 */
function buildSupervisionContext(input: {
  runId: string;
  stepIndex: number;
  actorRef: string;
  toolReason: string;
  policyToolScope: SupervisionToolScope;
}): RuntimeSupervisionContext {
  return {
    product: 'cats-work',
    surface: 'transport-work-golden-path',
    runId: input.runId,
    actionId: `${input.runId}:step-${input.stepIndex}:${input.toolReason}`,
    actorRef: input.actorRef,
    reason: input.toolReason,
    policyToolScope: input.policyToolScope,
  };
}

function buildOpeningInstruction(context: WorkGoldenPathStepContext): string {
  const criteria = context.acceptanceCriteria.length > 0
    ? context.acceptanceCriteria.map((entry) => `- ${entry}`).join('\n')
    : '- (none stated; report what you changed)';
  return [
    `Goal: ${context.goal}`,
    '',
    'Done when:',
    criteria,
    '',
    `Delivery mode: ${context.deliveryMode}`,
    'Work only inside the provided workspace. Do not declare the task complete;',
    ...(context.deliveryMode !== 'artifact_only'
      ? ['Cats will stage and commit the isolated worktree after verifying your response.']
      : []),
    'Cats verifies delivery evidence itself. For each criterion you believe now',
    'holds, end your reply with a line of exactly this form:',
    'CRITERIA-MET: <the criterion text, copied verbatim>',
  ].join('\n');
}

/**
 * The continuation prompt.
 *
 * It states the gap rather than re-asking the question, so a second turn is a
 * correction rather than a repeat of the first.
 */
function buildContinuationInstruction(context: WorkGoldenPathStepContext): string {
  const lines = [`Not accepted yet (step ${context.stepIndex + 1}).`];
  if (context.outstandingCriteria.length > 0) {
    lines.push('Still unmet:');
    lines.push(...context.outstandingCriteria.map((entry) => `- ${entry}`));
  }
  if (context.outstandingGaps.length > 0) {
    lines.push(`Missing evidence: ${context.outstandingGaps.join(', ')}.`);
  }
  lines.push('Continue until those hold, then summarize the change.');
  return lines.join('\n');
}

export function createWorkGoldenPathRuntimeExecutor(
  input: CreateWorkGoldenPathRuntimeExecutorInput,
): WorkGoldenPathStepExecutor {
  const collectEvidence = input.collectEvidence ?? noEvidenceCollector;
  const actorRef = input.actorRef ?? DEFAULT_ACTOR_REF;
  const resolveToolScope = input.resolveToolScope
    // Directly-constructed executors predate the run envelope and are used by
    // isolated product tests. Keep their historical safe write ceiling while
    // production always supplies the run-scoped value.
    ?? ((context) => context.toolScope ?? 'narrow_write');
  // One session per run, opened lazily and reused across steps so the agent
  // keeps its context instead of restarting from scratch every turn.
  const sessionsByRun = new Map<string, RuntimeSessionInfo>();

  return async (context): Promise<WorkGoldenPathStepResult> => {
    try {
      const runToolScope = resolveToolScope(context);
      if (runToolScope !== 'narrow_write' && runToolScope !== 'broad_write') {
        return {
          status: 'permission_denied',
          summary: 'The run is not authorized to modify an isolated workspace.',
          satisfiedCriteria: [],
          artifact: null,
          commit: null,
          blockedReason: 'workspace_write_not_authorized',
          denial: { toolName: 'cats.runtime.session.create', code: 'E_TOOL_SCOPE_DENIED' },
        };
      }
      let session = sessionsByRun.get(context.runId) ?? null;
      if (session === null) {
        const target = input.resolveTarget?.(context) ?? context.executionTarget ?? null;
        if (target === null) {
          return {
            status: 'failed',
            summary: 'No provider execution target was resolved for this run.',
            satisfiedCriteria: [],
            artifact: null,
            commit: null,
            blockedReason: 'execution_target_missing',
          };
        }
        session = await createSupervisedRuntimeSession({
          runtimeClient: input.runtimeClient,
          input: {
            provider: target.provider,
            instance: target.instance ?? null,
            model: target.model ?? null,
            cwd: context.workspacePath,
            workspaceKind: context.deliveryMode === 'artifact_only' ? 'sandbox' : 'worktree',
            workspaceAccess: 'read_write',
            permissionMode: 'whitelist',
            allowedTools: [...GOLDEN_PATH_LOCAL_FILE_TOOLS],
            context: {
              source: 'assignment',
              reason: 'work_golden_path_run',
              taskId: context.taskId ?? undefined,
              labels: ['cats-work', 'golden-path'],
            },
          },
          supervision: buildSupervisionContext({
            runId: context.runId,
            stepIndex: context.stepIndex,
            actorRef,
            toolReason: 'work_golden_path_session_create',
            // This scope authorizes the expensive orchestration call itself.
            // Provider tools are independently narrowed by the runtime
            // whitelist above.
            policyToolScope: 'broad_write',
          }),
        });
        sessionsByRun.set(context.runId, session);
      }

      const message = await sendSupervisedRuntimeMessage({
        runtimeClient: input.runtimeClient,
        sessionId: session.id,
        content: context.stepIndex === 0
          ? buildOpeningInstruction(context)
          : buildContinuationInstruction(context),
        supervision: buildSupervisionContext({
          runId: context.runId,
          stepIndex: context.stepIndex,
          actorRef,
          toolReason: 'work_golden_path_message_send',
          policyToolScope: 'broad_write',
        }),
      });
      const summary = resolveFullResponseText(message.segments).trim();
      const evidence = await collectEvidence({
        runId: context.runId,
        sessionId: session.id,
        goal: context.goal,
        deliveryMode: context.deliveryMode,
        workspacePath: context.workspacePath,
        deliveryWorkspacePath: session.cwd,
        baselineHeadOid: context.workspaceHeadOid ?? null,
        acceptanceCriteria: context.acceptanceCriteria,
        claimedCriteria: parseClaimedCriteria(summary),
      });

      return {
        status: 'claims_complete',
        summary: summary || 'The provider returned no text for this step.',
        satisfiedCriteria: evidence.satisfiedCriteria,
        artifact: evidence.artifact,
        commit: evidence.commit,
        blockedReason: null,
      };
    } catch (error) {
      sessionsByRun.delete(context.runId);

      // A refusal by the supervision boundary is not a provider failure. It
      // says the envelope is too narrow, which no retry can change, so it gets
      // its own status and names the tool the owner has to grant.
      if (
        error instanceof RuntimeSupervisionRejectedError
        && PERMISSION_REJECTION_CODES.has(error.rejectionCode)
      ) {
        return {
          status: 'permission_denied',
          summary: 'The supervision boundary refused this step.',
          satisfiedCriteria: [],
          artifact: null,
          commit: null,
          blockedReason: error.message,
          denial: { toolName: error.toolName, code: error.rejectionCode },
        };
      }

      // Provider loss is a failure of this run, not a silent retry: the owner is
      // told, and the Run reaches an authoritative terminal state.
      return {
        status: 'failed',
        summary: 'The supervised runtime session could not complete this step.',
        satisfiedCriteria: [],
        artifact: null,
        commit: null,
        blockedReason: error instanceof Error ? error.message : 'runtime_step_failed',
      };
    }
  };
}
