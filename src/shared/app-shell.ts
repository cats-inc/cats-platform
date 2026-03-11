import type { RuntimeStatusSummary } from '../runtime/client.js';

export interface WorkspaceChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: 'active' | 'planned' | 'watching';
  unreadCount: number;
  memberCount: number;
}

export interface AppShellPayload {
  app: {
    name: 'cats-inc';
    stage: 'phase-2-shell';
    runtimeBoundary: 'cats-runtime';
  };
  workspace: {
    id: string;
    name: string;
    selectedChannelId: string;
    channels: WorkspaceChannelSummary[];
    globalOrchestrator: {
      mode: 'planned';
      status: 'warming' | 'ready';
      nextFocus: string;
      entrypoints: string[];
      referenceProjects: string[];
      notes: string[];
    };
    capabilities: {
      multiChannel: boolean;
      persistence: 'planned';
      mentions: 'planned';
      splitView: 'planned';
    };
  };
  runtime: RuntimeStatusSummary;
  metadata: {
    generatedAt: string;
    host: string;
    port: number;
  };
}
