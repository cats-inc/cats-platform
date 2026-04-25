import type {
  AddressableTarget,
  BudgetEnvelope,
  SupervisedToolExecutor,
  SupervisedToolManifest,
  SupervisionPolicySnapshot,
  ToolResult,
  ToolResultStatus,
  ToolSurfaceGrant,
} from '../src/platform/supervision/index.ts';
import type { ToolBoundary } from '../src/platform/supervision/index.ts';

export interface FakeDrivingAgent {
  initialPlan(input: FakeAgentInput): SemanticPlan;
  reviseAfterRejection(
    input: FakeAgentInput,
    trace: ObservedActionTrace,
    rejection: ToolRejectionObservation,
  ): SemanticPlan;
}

export interface FakeAgentInput {
  runId: string;
  workItemId?: string;
  goal: string;
  availableTools: SupervisedToolManifest[];
  policySnapshot: SupervisionPolicySnapshot;
  contextRefs: string[];
  budget: BudgetEnvelope;
}

export interface SemanticPlan {
  planId: string;
  revisionOf?: string;
  steps: SemanticPlanStep[];
  stopCondition: 'after_steps' | 'after_approval' | 'on_rejection';
}

export interface SemanticPlanStep {
  stepId: string;
  target: AddressableTarget;
  toolName: string;
  args: unknown;
  expectation?: ToolResultStatus;
}

export interface ObservedActionTrace {
  planId: string;
  observedStepIds: string[];
  toolCalls: Array<{
    stepId: string;
    toolName: string;
    status: ToolResult<unknown>['status'];
    result?: unknown;
    error?: { code: string; message: string; details?: unknown };
    requestId?: string;
  }>;
}

export interface ToolRejectionObservation {
  stepId: string;
  toolName: string;
  code: string;
  message: string;
  details?: unknown;
}

export type UnknownToolExecutor = SupervisedToolExecutor<unknown, unknown>;

export interface FakeRunHarnessInput {
  agent: FakeDrivingAgent;
  input: FakeAgentInput;
  boundary: ToolBoundary;
  executors: Record<string, UnknownToolExecutor>;
  grantForStep: (step: SemanticPlanStep) => ToolSurfaceGrant;
  maxRecoveryDepth?: number;
}

export interface FakeRunHarnessResult {
  finalState: 'completed' | 'failed';
  traces: ObservedActionTrace[];
  recoveryCount: number;
  failureReason?: string;
}

export function createScriptedFakeDrivingAgent(input: {
  initialPlan: SemanticPlan;
  revisions: SemanticPlan[];
}): FakeDrivingAgent & { revisionCalls: ToolRejectionObservation[] } {
  const revisionCalls: ToolRejectionObservation[] = [];

  return {
    revisionCalls,
    initialPlan() {
      return input.initialPlan;
    },
    reviseAfterRejection(_agentInput, _trace, rejection) {
      revisionCalls.push(rejection);
      const revision = input.revisions[revisionCalls.length - 1];

      if (revision === undefined) {
        throw new Error(`No scripted revision for rejection ${revisionCalls.length}`);
      }

      return revision;
    },
  };
}

export async function runFakeDrivingAgentHarness(
  input: FakeRunHarnessInput,
): Promise<FakeRunHarnessResult> {
  const traces: ObservedActionTrace[] = [];
  let recoveryCount = 0;
  let plan = input.agent.initialPlan(input.input);
  const maxRecoveryDepth = input.maxRecoveryDepth ?? 3;

  while (true) {
    const { trace, rejection } = await executeSemanticPlan({
      plan,
      input: input.input,
      boundary: input.boundary,
      executors: input.executors,
      grantForStep: input.grantForStep,
    });
    traces.push(trace);

    if (rejection === undefined) {
      return {
        finalState: 'completed',
        traces,
        recoveryCount,
      };
    }

    if (recoveryCount >= maxRecoveryDepth) {
      return {
        finalState: 'failed',
        traces,
        recoveryCount,
        failureReason: `recovery depth cap exceeded: ${maxRecoveryDepth}`,
      };
    }

    recoveryCount += 1;
    plan = input.agent.reviseAfterRejection(input.input, trace, rejection);
  }
}

async function executeSemanticPlan(input: {
  plan: SemanticPlan;
  input: FakeAgentInput;
  boundary: ToolBoundary;
  executors: Record<string, UnknownToolExecutor>;
  grantForStep: (step: SemanticPlanStep) => ToolSurfaceGrant;
}): Promise<{
  trace: ObservedActionTrace;
  rejection?: ToolRejectionObservation;
}> {
  const trace: ObservedActionTrace = {
    planId: input.plan.planId,
    observedStepIds: [],
    toolCalls: [],
  };

  for (const step of input.plan.steps) {
    const execute = input.executors[step.toolName];

    if (execute === undefined) {
      throw new Error(`No executor registered for fake plan tool: ${step.toolName}`);
    }

    const result = await input.boundary.invoke({
      toolName: step.toolName,
      input: step.args,
      actionId: step.stepId,
      runId: input.input.runId,
      actorRef: 'fake-agent',
      grant: input.grantForStep(step),
      execute,
    });
    trace.observedStepIds.push(step.stepId);
    trace.toolCalls.push(toObservedToolCall(step, result));

    if (result.status === 'rejected') {
      return {
        trace,
        rejection: {
          stepId: step.stepId,
          toolName: step.toolName,
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
        },
      };
    }
  }

  return { trace };
}

function toObservedToolCall(
  step: SemanticPlanStep,
  result: ToolResult<unknown>,
): ObservedActionTrace['toolCalls'][number] {
  switch (result.status) {
    case 'applied':
      return {
        stepId: step.stepId,
        toolName: step.toolName,
        status: result.status,
        result: result.result,
      };
    case 'pending_approval':
      return {
        stepId: step.stepId,
        toolName: step.toolName,
        status: result.status,
        requestId: result.requestId,
      };
    case 'rejected':
      return {
        stepId: step.stepId,
        toolName: step.toolName,
        status: result.status,
        error: result.error,
      };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
