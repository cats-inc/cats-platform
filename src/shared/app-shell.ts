import type { RuntimeStatusSummary } from '../runtime/client.js';

export interface WorkspaceChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: 'active' | 'planned' | 'watching';
  unreadCount: number;
  memberCount: number;
}

export interface GlobalOrchestratorSummary {
  mode: 'planned';
  status: 'warming' | 'ready';
  nextFocus: string;
  entrypoints: string[];
  referenceProjects: string[];
  notes: string[];
}

export interface WorkspaceCapabilities {
  multiChannel: boolean;
  persistence: 'planned' | 'file-backed';
  mentions: 'planned';
  splitView: 'planned';
}

export interface WorkspaceShellState {
  id: string;
  name: string;
  selectedChannelId: string;
  channels: WorkspaceChannelSummary[];
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: WorkspaceCapabilities;
}

export interface AppShellPayload {
  app: {
    name: 'cats-inc';
    stage: 'phase-2-shell';
    runtimeBoundary: 'cats-runtime';
  };
  workspace: WorkspaceShellState;
  runtime: RuntimeStatusSummary;
  metadata: {
    generatedAt: string;
    host: string;
    port: number;
  };
}

export interface UpdateSelectedChannelInput {
  selectedChannelId: string;
}

export interface CreateWorkspaceChannelInput {
  title: string;
  topic: string;
}
