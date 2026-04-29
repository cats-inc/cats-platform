import type { RuntimeClient } from '../runtime/client.js';
import {
  createInMemoryToolEvidenceSink,
  createToolBoundary,
  type ToolBoundaryEvidenceSink,
} from '../supervision/toolBoundary.js';
import type {
  ToolResult,
} from '../supervision/contracts.js';
import {
  createSupervisedToolRegistry,
  type ToolSurfaceGrant,
} from '../supervision/toolRegistry.js';
import type { CatsAppToolRegistration } from './toolRegistration.js';

export interface CatsRuntimeAppToolCallRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'tools/call';
  params: {
    name: string;
    arguments: unknown;
    _meta: {
      catsAppId: string;
      catsPackagePath: string;
      catsActionId: string;
      catsRunId: string;
      catsActorRef: string;
      catsRuntimeBridge: 'cats-runtime';
    };
  };
}

export interface ExecuteCatsRuntimeBackedAppToolInput {
  runtimeClient: Pick<RuntimeClient, 'callMcp'>;
  registration: CatsAppToolRegistration;
  input: unknown;
  actionId: string;
  runId: string;
  actorRef: string;
  grant?: ToolSurfaceGrant;
  evidenceSink?: ToolBoundaryEvidenceSink;
  now?: () => string;
}

export function createCatsRuntimeAppToolCallRequest(
  input: Omit<
    ExecuteCatsRuntimeBackedAppToolInput,
    'runtimeClient' | 'grant' | 'evidenceSink' | 'now'
  >,
): CatsRuntimeAppToolCallRequest {
  return {
    jsonrpc: '2.0',
    id: `${input.runId}:${input.actionId}:${input.registration.manifest.name}`,
    method: 'tools/call',
    params: {
      name: input.registration.manifest.name,
      arguments: input.input,
      _meta: {
        catsAppId: input.registration.appId,
        catsPackagePath: input.registration.packagePath,
        catsActionId: input.actionId,
        catsRunId: input.runId,
        catsActorRef: input.actorRef,
        catsRuntimeBridge: 'cats-runtime',
      },
    },
  };
}

export async function executeCatsRuntimeBackedAppTool(
  input: ExecuteCatsRuntimeBackedAppToolInput,
): Promise<ToolResult<Record<string, unknown> | null>> {
  if (input.registration.runtimeBridge !== 'cats-runtime') {
    return {
      status: 'rejected',
      error: {
        code: 'E_PRECHECK_FAILED',
        message: `App tool is not declared as cats-runtime-backed: ${input.registration.manifest.name}`,
      },
    };
  }

  const registry = createSupervisedToolRegistry();
  registry.register(input.registration.manifest);
  const boundary = createToolBoundary({
    registry,
    evidenceSink: input.evidenceSink ?? createInMemoryToolEvidenceSink(),
    now: input.now,
  });

  return boundary.invoke<unknown, Record<string, unknown> | null>({
    toolName: input.registration.manifest.name,
    input: input.input,
    actionId: input.actionId,
    runId: input.runId,
    actorRef: input.actorRef,
    grant: input.grant ?? {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    execute: async (toolInput) => ({
      status: 'applied',
      result: await input.runtimeClient.callMcp(createCatsRuntimeAppToolCallRequest({
        registration: input.registration,
        input: toolInput,
        actionId: input.actionId,
        runId: input.runId,
        actorRef: input.actorRef,
      })),
    }),
  });
}
