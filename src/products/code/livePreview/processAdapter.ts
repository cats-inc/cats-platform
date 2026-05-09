export interface LivePreviewProcessSpawnInput {
  commandProfileId: string;
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  port: number;
  origin: string;
}

export interface LivePreviewProcessExit {
  code: number | null;
  signal: string | null;
}

export interface LivePreviewProcessStopOptions {
  graceMs: number;
  killProcessTree: boolean;
}

export interface LivePreviewProcessHandle {
  processId: number | null;
  onStdout(listener: (chunk: string) => void): void;
  onStderr(listener: (chunk: string) => void): void;
  onExit(listener: (exit: LivePreviewProcessExit) => void): void;
  stop(options: LivePreviewProcessStopOptions): Promise<void>;
}

export interface LivePreviewProcessAdapter {
  spawn(input: LivePreviewProcessSpawnInput): Promise<LivePreviewProcessHandle>;
}

export interface LivePreviewReadinessProbeResult {
  status: number;
}

export type LivePreviewReadinessProbe = (
  url: string,
) => Promise<LivePreviewReadinessProbeResult>;

export async function fetchLivePreviewReadiness(url: string): Promise<LivePreviewReadinessProbeResult> {
  const response = await fetch(url);
  return { status: response.status };
}
