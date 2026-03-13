import type { AppConfig } from '../config.js';
import type { RuntimeStatusSummary } from '../runtime/client.js';
import type { AppShellPayload, WorkspaceState } from '../shared/app-shell.js';
import { summarizeState } from './model.js';

export function createAppShell(
  config: AppConfig,
  runtime: RuntimeStatusSummary,
  workspace: WorkspaceState,
  now: Date = new Date(),
): AppShellPayload {
  const summary = summarizeState(workspace);

  return {
    app: {
      name: 'cats-inc',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      selectedChannelId: workspace.selectedChannelId,
      pals: summary.pals,
      channels: summary.channels,
      selectedChannel: summary.selectedChannel,
      globalOrchestrator: {
        ...summary.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
      capabilities: workspace.capabilities,
    },
    runtime,
    metadata: {
      generatedAt: now.toISOString(),
      host: config.host,
      port: config.port,
    },
  };
}
